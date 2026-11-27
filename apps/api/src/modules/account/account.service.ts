import type {
  Me,
  NextStep,
  PaginationInput,
  SessionItem,
  SwitchOrganizationOutput,
  TwoStepRequirement,
} from '@vento/shared'
import { approvableModules, hasPermission } from '@vento/shared'
import { and, count, desc, eq, gt, ne } from 'drizzle-orm'
import {
  type AuthSession,
  type AuthUser,
  listActiveMemberships,
  loadMembership,
  type MemberContext,
  type Membership,
  resolveMembership,
  setActiveOrganization,
  touchMemberActivity,
  twoStepRequired,
} from '@/access/context'
import { enteredAtFor, memberTwoStepGate, type TwoStepGate } from '@/access/two-step-gate'
import { firstTwoStepRequirement, userIdForResetToken } from '@/auth/security-store'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { entities, sessions, users } from '@/db/schema'
import { summariseUserAgent } from '@/lib/client-ip'
import { notFound } from '@/lib/errors'
import { pageOffset, toPage } from '@/lib/paginate'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { organizationAvailability } from '@/platform/availability'
import type { FeatureStore } from '@/platform/feature-store'
import { planSummary } from '@/platform/plan-summary'
import { activeSuperAdmin } from '@/platform/super-admins'

async function hasEntity(db: DbOrTx, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.organizationId, organizationId))
    .limit(1)
  return Boolean(row)
}

async function nextStepFor(
  db: DbOrTx,
  membership: Membership | null,
  gate: TwoStepGate,
): Promise<NextStep> {
  if (!membership) return 'onboarding_organization'
  // Only an owner can finish setting the organization up; anyone invited before the first
  // entity exists goes straight on to two-step or the app.
  if (membership.member.roleKey === 'owner' && !(await hasEntity(db, membership.organizationId))) {
    return 'onboarding_entity'
  }
  if (gate.kind === 'required') return 'two_step_setup'
  return 'ready'
}

function gateFor(
  user: AuthUser,
  session: Pick<AuthSession, 'activeOrganizationId' | 'organizationEnteredAt'>,
  membership: Membership | null,
  now: Date,
): TwoStepGate {
  if (!membership) return { kind: 'ok' }
  const enteredAt = enteredAtFor(session, membership.organizationId, now)
  return memberTwoStepGate(user, membership.member, enteredAt, now)
}

/**
 * What requires two-step for this person, the active organization first (My security's line).
 * The active membership answers without a query when it requires it itself.
 */
export async function twoStepRequiredBy(
  db: DbOrTx,
  user: Pick<AuthUser, 'id' | 'twoStepSetupRequired'>,
  membership: Pick<Membership, 'organizationId' | 'organizationName' | 'member'> | null,
): Promise<TwoStepRequirement | null> {
  const member = membership?.member
  if (membership && member?.requiresTwoStep) {
    return {
      reason: 'role',
      organizationName: membership.organizationName,
      roleName: member.roleName,
    }
  }
  if (membership && member?.organizationTwoStep.required) {
    return { reason: 'organization', organizationName: membership.organizationName, roleName: null }
  }
  const elsewhere = await firstTwoStepRequirement(db, user.id, membership?.organizationId ?? null)
  if (elsewhere) return elsewhere
  return user.twoStepSetupRequired
    ? { reason: 'reset', organizationName: membership?.organizationName ?? '', roleName: null }
    : null
}

/**
 * Available features for the organization and, for owners only, the plan block. Unavailable
 * keys, stages and other plans' contents never leave the server.
 */
async function featuresAndPlan(
  db: DbOrTx,
  membership: Membership | null,
  store: FeatureStore,
): Promise<Pick<Me, 'features' | 'plan'>> {
  if (!membership) return { features: [], plan: null }
  const now = new Date()
  const snapshot = await store.get()
  const availability = organizationAvailability(
    snapshot,
    { organizationId: membership.organizationId, ...membership.plan },
    now,
  )
  const isOwner = membership.member.roleKey === 'owner'
  return {
    features: availability.list(),
    plan: isOwner ? await planSummary(db, availability, snapshot, now) : null,
  }
}

/** The single source of truth for the web's guards: who, where, and what to do next. */
export async function getMe(
  db: DbOrTx,
  user: AuthUser,
  session: AuthSession,
  store: FeatureStore,
): Promise<Me> {
  const membership = await resolveMembership(db, user, session)
  const gate = gateFor(user, session, membership, new Date())
  const [step, organizations, { features, plan }, requiredBy, admin] = await runQueries(db, [
    () => nextStepFor(db, membership, gate),
    () => listActiveMemberships(db, user.id),
    () => featuresAndPlan(db, membership, store),
    () => twoStepRequiredBy(db, user, membership),
    () => activeSuperAdmin(db, user.id),
  ])
  // A staff account never onboards (decision 0023): an active super-admin with two-step goes
  // to the console; anyone else staff (joining, or after a reset) sets two-step up first.
  const nextStep: NextStep =
    user.accountKind === 'staff' ? (admin?.twoFactorEnabled ? 'console' : 'two_step_setup') : step
  // Only someone through every gate (onboarding, two-step) is using the organization.
  if (membership && nextStep === 'ready') await touchMemberActivity(db, membership.member)
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
      companyName: user.companyName,
    },
    organization: membership
      ? {
          id: membership.organizationId,
          name: membership.organizationName,
          internal: membership.plan.releaseGroup === 'internal',
        }
      : null,
    features,
    plan,
    organizations,
    member: membership
      ? {
          id: membership.member.id,
          role: {
            id: membership.member.roleId,
            key: membership.member.roleKey,
            name: membership.member.roleName,
          },
          entityIds: membership.member.entityIds,
          permissions: membership.member.permissions,
        }
      : null,
    nextStep,
    twoStepRequired: twoStepRequired(user, membership?.member ?? null),
    twoStepRequiredBy: requiredBy,
    twoStepSetupBy: gate.kind === 'grace' ? gate.deadline.toISOString() : null,
    canAddCompany: membership ? canAddCompany(membership.member) : false,
    console: admin ? { twoStepOn: admin.twoFactorEnabled } : null,
    // STUB (brick 4 build-order step 8): the waiting count and "made a request in the last 90
    // days" need the approvals tables. Until then: nothing waits, and approvers see the inbox.
    approvalsWaiting: 0,
    canSeeApprovals: membership
      ? approvableModules(membership.member.permissions).length > 0
      : false,
  }
}

/** Settings create and access to every company: "+ Add company" in the switcher, Home and ⌘K. */
export function canAddCompany(member: Pick<MemberContext, 'permissions' | 'entityIds'>): boolean {
  return hasPermission(member.permissions, 'settings', 'create') && member.entityIds === null
}

/**
 * Makes one of the person's organizations active for this session and their next sign-in.
 * Not audited: it changes where they're looking, not any data or access.
 */
export async function switchOrganization(
  db: DbOrTx,
  user: AuthUser,
  session: AuthSession,
  organizationId: string,
): Promise<SwitchOrganizationOutput> {
  const membership = await db.transaction(async (tx) => {
    const found = await loadMembership(tx, user.id, organizationId)
    // loadMembership falls back to another organization; only the one asked for counts.
    if (!found || found.organizationId !== organizationId) throw notFound()
    if (session.activeOrganizationId !== organizationId) {
      await setActiveOrganization(tx, { userId: user.id, sessionId: session.id, organizationId })
    }
    return found
  })
  // Switching in counts as entering: a requiring organization asks for setup now (gateFor).
  const gate = gateFor(user, session, membership, new Date())
  return {
    organization: { id: membership.organizationId, name: membership.organizationName },
    nextStep: await nextStepFor(db, membership, gate),
  }
}

/** The email a reset link belongs to, for the reset screen. Expired or used: not found. */
export async function passwordResetInfo(db: DbOrTx, token: string): Promise<{ email: string }> {
  const userId = await userIdForResetToken(db, token)
  const [user] = userId
    ? await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
    : []
  if (!user) throw notFound()
  return user
}

export async function listSessions(
  db: DbOrTx,
  user: AuthUser,
  current: AuthSession,
  input: PaginationInput,
) {
  const where = and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))
  const { limit, offset } = pageOffset(input)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        lastActiveAt: sessions.lastActiveAt,
        createdAt: sessions.createdAt,
        persistent: sessions.persistent,
        place: sessions.place,
      })
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.lastActiveAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(sessions).where(where),
  ])
  const items: SessionItem[] = rows.map((r) => ({
    id: r.id,
    ...summariseUserAgent(r.userAgent),
    ipMasked: r.ipAddress || null,
    place: r.place || null,
    lastActiveAt: r.lastActiveAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    persistent: r.persistent,
    isCurrent: r.id === current.id,
  }))
  return toPage(items, input, total?.n ?? 0)
}

const self = (user: AuthUser) => ({ userId: user.id, name: user.name })

/** Ends one of your own sessions. Someone else's session id is simply not found. */
export async function revokeSession(
  db: DbOrTx,
  user: AuthUser,
  id: string,
): Promise<{ notice: string }> {
  return db.transaction(async (tx) => {
    const ended = await tx
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .returning({ id: sessions.id, userAgent: sessions.userAgent })
    const [row] = ended
    if (!row) throw notFound('That device is already signed out. The list is up to date.')
    const { device, browser } = summariseUserAgent(row.userAgent)
    await recordAccountEvent(tx, {
      userId: user.id,
      action: 'session.revoked',
      actor: self(user),
      target: { type: 'session', id: row.id, label: `${browser} on ${device}` },
    })
    return { notice: `Signed out of ${browser} on ${device}` }
  })
}

export async function revokeOtherSessions(
  db: DbOrTx,
  user: AuthUser,
  current: AuthSession,
): Promise<{ count: number; notice: string }> {
  return db.transaction(async (tx) => {
    const ended = await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, current.id)))
      .returning({ id: sessions.id })
    const n = ended.length
    await recordAccountEvent(tx, {
      userId: user.id,
      action: 'session.revoked_others',
      actor: self(user),
      metadata: { count: n },
    })
    const notice =
      n === 0
        ? 'No other devices were signed in'
        : `Signed out of ${n} other ${n === 1 ? 'device' : 'devices'}`
    return { count: n, notice }
  })
}
