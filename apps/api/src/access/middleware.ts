import { os as baseOs, ORPCError } from '@orpc/server'
import type { PermissionAction, PermissionModule, ProcedureMeta } from '@vento/shared'
import { hasPermission, ORGANIZATION_HEADER } from '@vento/shared'
import { applySessionPolicy, toPolicySession } from '@/auth/session-policy'
import type { BaseContext } from '@/context'
import { forbidden, notFound, organizationChanged } from '@/lib/errors'
import { requestScope } from '@/lib/request-scope'
import { type OrganizationAvailability, organizationAvailability } from '@/platform/availability'
import {
  type AuthSession,
  type AuthUser,
  loadMembership,
  type MemberContext,
  touchMemberActivity,
  writeBackActiveOrganization,
} from './context'
import { allEntitiesMessage } from './role-refusals'
import { enteredAtFor, memberTwoStepGate } from './two-step-gate'
import { firstOwner, whoCanGrant } from './who-can-grant'

const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?vento\.session_token=/

/** Better Auth hands additional date fields back as Date or ISO text. */
function optionalDate(value: Date | string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

function unauthorized(reason: 'signed_out' | 'session_expired') {
  return new ORPCError('UNAUTHORIZED', {
    message:
      reason === 'session_expired'
        ? 'Your session has ended. For security, Vento Real Estate signs you out after 30 minutes without activity.'
        : 'Please sign in',
    data: { reason },
  })
}

/**
 * Signed in, with a live session under our idle and maximum-age rules. A cookie that no
 * longer matches a session (expired, revoked, signed out elsewhere) reads as session_expired,
 * so the web can show the dialog and keep the page underneath.
 */
export async function authenticate(
  context: Pick<BaseContext, 'auth' | 'db' | 'headers'>,
): Promise<{ user: AuthUser; session: AuthSession }> {
  const hadCookie = SESSION_COOKIE.test(context.headers.get('cookie') ?? '')
  const result = await context.auth.api.getSession({ headers: context.headers })
  if (!result) throw unauthorized(hadCookie ? 'session_expired' : 'signed_out')
  const s = result.session
  if ((await applySessionPolicy(context.db, s)) === 'expired') throw unauthorized('session_expired')
  const policy = toPolicySession(s)
  const session: AuthSession = {
    ...policy,
    userId: s.userId,
    activeOrganizationId: s.activeOrganizationId ?? null,
    organizationEnteredAt: optionalDate(s.organizationEnteredAt) ?? policy.createdAt,
    reauthenticatedAt: optionalDate(s.reauthenticatedAt),
    secondFactorAt: optionalDate(s.secondFactorAt),
    consoleOpenedAt: optionalDate(s.consoleOpenedAt),
    consoleActiveAt: optionalDate(s.consoleActiveAt),
  }
  const u = result.user
  const user: AuthUser = {
    id: u.id,
    name: u.name,
    email: u.email,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    twoStepSetupRequired: Boolean(u.twoStepSetupRequired),
    companyName: u.companyName ?? null,
    accountKind: u.accountKind === 'staff' ? 'staff' : 'customer',
  }
  requestScope().auth.userId = user.id
  return { user, session }
}

export const authedMiddleware = baseOs
  .$context<BaseContext>()
  .middleware(async ({ context, next }) => next({ context: await authenticate(context) }))

type AuthedContext = BaseContext & { user: AuthUser; session: AuthSession }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolves the organization from the session and loads the member's role and limits.
 *
 * Tab guard (decision 0013): when the request names the organization its tab is showing, any
 * mismatch is refused before the membership is read and before the session is written back.
 * The header can only make a request fail; the organization always comes from the session.
 *
 * Feature gate (decision 0016): the procedure's contract declares `meta.feature`. When that
 * feature isn't available to the organization (not released or not entitled), the answer is
 * NOT_FOUND, before any permission check, from the in-memory snapshot (no query).
 */
export function memberMiddleware(enforceTwoStep: boolean) {
  return baseOs.$context<AuthedContext>().middleware(async ({ context, next, procedure }) => {
    // A staff account has no organization to see: to it, customer data doesn't exist. Read from
    // the session's user, so no query runs (the staff walk in procedure-guard.test.ts proves it).
    if (context.user.accountKind === 'staff') throw notFound()
    const expected = context.headers.get(ORGANIZATION_HEADER)
    const active = context.session.activeOrganizationId
    if (expected && (!UUID.test(expected) || (active && expected !== active))) {
      throw organizationChanged()
    }
    const membership = await loadMembership(context.db, context.user.id, active)
    // The session's organization is gone (removed elsewhere) and we fell back to another one.
    if (expected && membership?.organizationId !== expected) throw organizationChanged()
    await writeBackActiveOrganization(context.db, context.user, context.session, membership)
    if (!membership) {
      throw forbidden('permission', 'Set up your organization first.')
    }
    const now = new Date()
    if (enforceTwoStep) {
      const enteredAt = enteredAtFor(context.session, membership.organizationId, now)
      const gate = memberTwoStepGate(context.user, membership.member, enteredAt, now)
      // `grace` goes ahead: the banner asks, and the deadline or the next sign-in enforces it.
      if (gate.kind === 'required') {
        throw forbidden('two_step_setup_required', 'Set up two-step sign-in to continue.')
      }
    }
    const features = organizationAvailability(
      await context.featureStore.get(),
      { organizationId: membership.organizationId, ...membership.plan },
      now,
    )
    const feature = (procedure['~orpc'].meta as ProcedureMeta).feature
    // Unavailable reads exactly like a missing record: to this organization it doesn't exist.
    if (feature && !features.has(feature)) throw notFound()
    // After the tab guard, two-step and feature gate: only requests that go ahead count.
    await touchMemberActivity(context.db, membership.member)
    return next({
      context: {
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        member: membership.member,
        features,
      },
    })
  })
}

type MemberRequestContext = AuthedContext & {
  organizationId: string
  organizationName: string
  member: MemberContext
  features: OrganizationAvailability
}

/**
 * Server-side permission check per module × action. The refusal names who can grant it:
 * "Only owners and admins can invite people. Ask Olumide Bankole (owner)."
 */
export function requirePermission(
  module: PermissionModule,
  action: PermissionAction,
  doing: string,
) {
  return baseOs.$context<MemberRequestContext>().middleware(async ({ context, next }) => {
    if (!hasPermission(context.member.permissions, module, action)) {
      const advice = await whoCanGrant(context.db, {
        organizationId: context.organizationId,
        module,
        action,
        doing,
        excludeUserId: context.user.id,
      })
      throw forbidden(
        'permission',
        advice.message,
        advice.askName && advice.askRole
          ? { askName: advice.askName, askRole: advice.askRole }
          : undefined,
      )
    }
    return next()
  })
}

/**
 * Organization-wide changes (the organization profile, adding, archiving and restoring
 * companies, making, editing or deleting roles) need access to every company. Runs after
 * requirePermission; the owner's name is looked up only on refusal.
 */
export function requireAllEntities() {
  return baseOs.$context<MemberRequestContext>().middleware(async ({ context, next }) => {
    if (context.member.entityIds !== null) {
      const owner = await firstOwner(context.db, context.organizationId, context.user.id)
      throw forbidden(
        'all_entities_required',
        allEntitiesMessage(owner?.name ?? null),
        owner ? { askName: owner.name, askRole: 'owner' } : undefined,
      )
    }
    return next()
  })
}

/**
 * Owners only, whatever else the role allows (approval rules are the MD's controls: spec open
 * question 1). Runs after requirePermission; the refusal is the page's own read-only line.
 */
export function requireOwner(message: string) {
  return baseOs.$context<MemberRequestContext>().middleware(async ({ context, next }) => {
    if (context.member.roleKey !== 'owner') throw forbidden('owner_only', message)
    return next()
  })
}

/** For public token procedures: a per-IP budget per procedure. */
export function publicRateLimit(name: string, max: number) {
  return baseOs.$context<BaseContext>().middleware(async ({ context, next }) => {
    const ip = requestScope().ip ?? 'unknown'
    const retryAfterSeconds = context.rateLimiter.hit(`${name}:${ip}`, max)
    if (retryAfterSeconds > 0) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts. Wait a minute and try again.',
        data: { retryAfterSeconds },
      })
    }
    return next()
  })
}
