import { ORPCError } from '@orpc/server'
import type { PermissionSet, SystemRoleKey } from '@vento/shared'
import {
  emptyPermissionSet,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionModule,
} from '@vento/shared'
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { MEMBER_ACTIVITY_WRITE_INTERVAL_MS } from '@/auth/policy'
import type { DbOrTx } from '@/db/client'
import { rawTimestamp } from '@/db/raw'
import { members, organizations, roles, sessions, users } from '@/db/schema'
import type { OrganizationAvailability } from '@/platform/availability'

/** The signed-in person, from Better Auth's user row. */
export type AuthUser = {
  id: string
  name: string
  email: string
  twoFactorEnabled: boolean
  twoStepSetupRequired: boolean
  companyName: string | null
}

/** The current session row. */
export type AuthSession = {
  id: string
  userId: string
  activeOrganizationId: string | null
  persistent: boolean
  createdAt: Date
  lastActiveAt: Date
  /** When the session last moved into its active organization (created_at for older rows). */
  organizationEnteredAt: Date
  /** "Confirm it's you": when the password was last proven on this session. */
  reauthenticatedAt: Date | null
}

export type MemberContext = {
  id: string
  roleId: string
  roleKey: SystemRoleKey | null
  roleName: string
  permissions: PermissionSet
  /** null = all entities. */
  entityIds: string[] | null
  /** The role's own value (roles and the manage rules use it). */
  requiresTwoStep: boolean
  /** The organization's "Require two-step for everyone" and when it was last changed. */
  organizationTwoStep: { required: boolean; since: Date | null }
  /** As read with the membership, so the hourly activity write needs no extra read. */
  lastActiveAt: Date | null
}

export type Membership = {
  organizationId: string
  organizationName: string
  member: MemberContext
  /** Release group and plan version; standard with no plan when the row is missing. */
  plan: { releaseGroup: 'standard' | 'pilot' | 'internal'; planVersionId: string | null }
}

/** What services receive. Organization and member come from the session, never from input. */
export type ServiceContext = {
  db: DbOrTx
  organizationId: string
  organizationName: string
  user: Pick<AuthUser, 'id' | 'name' | 'email'>
  member: MemberContext
  sessionId: string | null
  /** What's available to the organization (and its limits), from the in-memory snapshot. */
  features: OrganizationAvailability
}

/** The audit actor for a service call: the signed-in person, by id and name at the time. */
export function actorOf(ctx: Pick<ServiceContext, 'user'>): { userId: string; name: string } {
  return { userId: ctx.user.id, name: ctx.user.name }
}

type MembershipRow = {
  member_id: string
  organization_id: string
  organization_name: string
  role_id: string
  role_key: string | null
  role_name: string
  requires_two_step: boolean
  organization_two_step_required: boolean
  organization_two_step_since: Date | string | null
  permissions: string[] | null
  entity_ids: string[] | null
  last_active_at: Date | string | null
  release_group: 'standard' | 'pilot' | 'internal' | null
  plan_version_id: string | null
}

export function toPermissionSet(pairs: readonly string[]): PermissionSet {
  const set = emptyPermissionSet()
  for (const pair of pairs) {
    const [module, action] = pair.split('.') as [PermissionModule, PermissionAction]
    if (PERMISSION_MODULES.includes(module)) set[module].push(action)
  }
  return set
}

/**
 * The person's active membership, in one query: the session's organization when they're
 * still a member there, otherwise their most recent one. Not cached, so a role or limit
 * change applies on the next request; any cache of permissions added later must key on
 * roles.version. The organization's release group and plan version come along (left join, so
 * an organization created by older code reads as standard with no plan).
 */
export async function loadMembership(
  db: DbOrTx,
  userId: string,
  preferredOrganizationId: string | null,
): Promise<Membership | null> {
  const result = await db.execute<MembershipRow>(sql`
    select m.id as member_id, m.organization_id, o.name as organization_name,
      r.id as role_id, r.key as role_key, r.name as role_name, r.requires_two_step,
      o.two_step_required_for_everyone as organization_two_step_required,
      o.two_step_required_changed_at as organization_two_step_since,
      (select array_agg(rp.module || '.' || rp.action) from role_permissions rp
        where rp.role_id = r.id) as permissions,
      -- Every limit row, archived entities included: a member limited only to archived
      -- companies must read as that list ("No company"), never as null (all companies).
      (select array_agg(l.entity_id) from member_entity_limits l
        where l.member_id = m.id) as entity_ids,
      m.last_active_at, op.release_group, op.plan_version_id
    from members m
    join roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join organizations o on o.id = m.organization_id
    left join organization_plans op on op.organization_id = m.organization_id
    where m.user_id = ${userId} and m.status = 'active'
    order by (m.organization_id = ${preferredOrganizationId}::uuid) is true desc, m.joined_at desc, m.id desc
    limit 1
  `)
  const row = result.rows[0]
  if (!row) return null
  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    member: {
      id: row.member_id,
      roleId: row.role_id,
      roleKey: row.role_key as SystemRoleKey | null,
      roleName: row.role_name,
      permissions: toPermissionSet(row.permissions ?? []),
      entityIds: row.entity_ids,
      requiresTwoStep: row.requires_two_step,
      organizationTwoStep: organizationTwoStepOf(row),
      lastActiveAt: rawTimestamp(row.last_active_at),
    },
    plan: {
      releaseGroup: row.release_group ?? 'standard',
      planVersionId: row.plan_version_id,
    },
  }
}

function organizationTwoStepOf(row: {
  organization_two_step_required: boolean
  organization_two_step_since: Date | string | null
}): MemberContext['organizationTwoStep'] {
  return {
    required: row.organization_two_step_required,
    since: rawTimestamp(row.organization_two_step_since),
  }
}

/**
 * Points the session (and the person's default for new sessions) at an organization. Moving the
 * session to a different organization stamps when it entered: the two-step gate tells "next
 * switch in" from "already there" by it.
 */
export async function setActiveOrganization(
  db: DbOrTx,
  input: { userId: string; sessionId: string | null; organizationId: string },
): Promise<void> {
  if (input.sessionId) {
    await db
      .update(sessions)
      .set({
        activeOrganizationId: input.organizationId,
        organizationEnteredAt: sql`case when ${sessions.activeOrganizationId} is distinct from ${input.organizationId}::uuid then now() else ${sessions.organizationEnteredAt} end`,
      })
      .where(eq(sessions.id, input.sessionId))
  }
  await db
    .update(users)
    .set({ lastActiveOrganizationId: input.organizationId })
    .where(eq(users.id, input.userId))
}

/**
 * Points the session at the membership actually loaded, when the session's organization was
 * gone (removed, or never set) and loadMembership fell back to another one.
 */
export async function writeBackActiveOrganization(
  db: DbOrTx,
  user: Pick<AuthUser, 'id'>,
  session: Pick<AuthSession, 'id' | 'activeOrganizationId'>,
  membership: Pick<Membership, 'organizationId'> | null,
): Promise<void> {
  if (!membership || membership.organizationId === session.activeOrganizationId) return
  await setActiveOrganization(db, {
    userId: user.id,
    sessionId: session.id,
    organizationId: membership.organizationId,
  })
}

/** Membership for this session, writing back the fallback choice when it changed. */
export async function resolveMembership(
  db: DbOrTx,
  user: Pick<AuthUser, 'id'>,
  session: Pick<AuthSession, 'id' | 'activeOrganizationId'>,
): Promise<Membership | null> {
  const membership = await loadMembership(db, user.id, session.activeOrganizationId)
  await writeBackActiveOrganization(db, user, session, membership)
  return membership
}

/** Every organization the person is an active member of, with their role there, by name. */
export async function listActiveMemberships(
  db: DbOrTx,
  userId: string,
): Promise<{ id: string; name: string; roleName: string }[]> {
  return db
    .select({ id: organizations.id, name: organizations.name, roleName: roles.name })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(and(eq(members.userId, userId), eq(members.status, 'active')))
    .orderBy(asc(organizations.name), asc(organizations.id))
}

/**
 * Two-step is required here, whether or not it's set up: an owner or admin reset it, the role
 * requires it, or the organization requires it for everyone. Whether it blocks now is the gate's
 * call (two-step-gate.ts).
 */
export function twoStepRequired(
  user: Pick<AuthUser, 'twoStepSetupRequired'>,
  member: Pick<MemberContext, 'requiresTwoStep' | 'organizationTwoStep'> | null,
): boolean {
  return (
    user.twoStepSetupRequired ||
    Boolean(member?.requiresTwoStep) ||
    Boolean(member?.organizationTwoStep.required)
  )
}

/**
 * Records that the member used Vento, at most once an hour: the value read with the membership
 * decides, so a recent one costs nothing, and the conditional update keeps two requests at once
 * to one write. `updated_at` stays put: activity isn't a change to the member.
 */
export async function touchMemberActivity(
  db: DbOrTx,
  member: Pick<MemberContext, 'id' | 'lastActiveAt'>,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - MEMBER_ACTIVITY_WRITE_INTERVAL_MS)
  if (member.lastActiveAt && member.lastActiveAt > cutoff) return
  await db
    .update(members)
    .set({ lastActiveAt: now, updatedAt: sql`${members.updatedAt}` })
    .where(
      and(
        eq(members.id, member.id),
        or(isNull(members.lastActiveAt), lt(members.lastActiveAt, cutoff)),
      ),
    )
}

type ViewerRow = {
  role_id: string
  role_key: string | null
  role_name: string
  requires_two_step: boolean
  organization_two_step_required: boolean
  organization_two_step_since: Date | string | null
  permissions: string[] | null
  entity_ids: string[] | null
}

/**
 * The signed-in member as they are now, read inside a write transaction with their member and
 * role rows locked `for share`: a change to their own role or access made after the request
 * began either lands first and is seen here, or waits until this write commits. Rules that
 * decide what the viewer may do (the ceiling, manage rules, grants) must use this, not the
 * membership read at the start of the request. Removed meanwhile: refused like any other member
 * without access. Lock order: right after the organization row (docs/ARCHITECTURE.md).
 */
export async function lockViewer<T extends Pick<ServiceContext, 'organizationId' | 'member'>>(
  tx: DbOrTx,
  ctx: T,
): Promise<T> {
  const result = await tx.execute<ViewerRow>(sql`
    select r.id as role_id, r.key as role_key, r.name as role_name, r.requires_two_step,
      o.two_step_required_for_everyone as organization_two_step_required,
      o.two_step_required_changed_at as organization_two_step_since,
      (select array_agg(rp.module || '.' || rp.action) from role_permissions rp
        where rp.role_id = r.id) as permissions,
      (select array_agg(l.entity_id) from member_entity_limits l
        where l.member_id = m.id) as entity_ids
    from members m
    join roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join organizations o on o.id = m.organization_id
    where m.id = ${ctx.member.id} and m.organization_id = ${ctx.organizationId}
      and m.status = 'active'
    for share of m, r
  `)
  const row = result.rows[0]
  if (!row) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Your access has changed. Reload the page to continue.',
      data: { reason: 'access_changed' as const },
    })
  }
  return {
    ...ctx,
    member: {
      ...ctx.member,
      roleId: row.role_id,
      roleKey: row.role_key as SystemRoleKey | null,
      roleName: row.role_name,
      permissions: toPermissionSet(row.permissions ?? []),
      entityIds: row.entity_ids,
      requiresTwoStep: row.requires_two_step,
      organizationTwoStep: organizationTwoStepOf(row),
    },
  }
}
