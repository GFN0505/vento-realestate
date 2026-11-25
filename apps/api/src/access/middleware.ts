import { os as baseOs, ORPCError } from '@orpc/server'
import type { PermissionAction, PermissionModule } from '@vento/shared'
import { hasPermission } from '@vento/shared'
import { applySessionPolicy, toPolicySession } from '@/auth/session-policy'
import type { BaseContext } from '@/context'
import { forbidden } from '@/lib/errors'
import { requestScope } from '@/lib/request-scope'
import {
  type AuthSession,
  type AuthUser,
  type MemberContext,
  resolveMembership,
  twoStepRequired,
} from './context'
import { whoCanGrant } from './who-can-grant'

const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?vento\.session_token=/

function unauthorized(reason: 'signed_out' | 'session_expired') {
  return new ORPCError('UNAUTHORIZED', {
    message:
      reason === 'session_expired'
        ? 'Your session has ended. For security, Vento signs you out after 30 minutes without activity.'
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
  const session: AuthSession = {
    ...toPolicySession(s),
    userId: s.userId,
    activeOrganizationId: s.activeOrganizationId ?? null,
  }
  const u = result.user
  const user: AuthUser = {
    id: u.id,
    name: u.name,
    email: u.email,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    twoStepSetupRequired: Boolean(u.twoStepSetupRequired),
    companyName: u.companyName ?? null,
  }
  requestScope().auth.userId = user.id
  return { user, session }
}

export const authedMiddleware = baseOs
  .$context<BaseContext>()
  .middleware(async ({ context, next }) => next({ context: await authenticate(context) }))

type AuthedContext = BaseContext & { user: AuthUser; session: AuthSession }

/** Resolves the organization from the session and loads the member's role and limits. */
export function memberMiddleware(enforceTwoStep: boolean) {
  return baseOs.$context<AuthedContext>().middleware(async ({ context, next }) => {
    const membership = await resolveMembership(context.db, context.user, context.session)
    if (!membership) {
      throw forbidden('permission', 'Set up your organization first.')
    }
    if (
      enforceTwoStep &&
      twoStepRequired(context.user, membership.member) &&
      !context.user.twoFactorEnabled
    ) {
      throw forbidden('two_step_setup_required', 'Set up two-step sign-in to continue.')
    }
    return next({
      context: {
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        member: membership.member,
      },
    })
  })
}

type MemberRequestContext = AuthedContext & {
  organizationId: string
  organizationName: string
  member: MemberContext
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
