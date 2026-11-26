import type { PermissionSet, SystemRoleKey } from '@vento/shared'
import {
  emptyPermissionSet,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionModule,
} from '@vento/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { members, organizations, roles, sessions, users } from '@/db/schema'

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
}

export type MemberContext = {
  id: string
  roleId: string
  roleKey: SystemRoleKey | null
  roleName: string
  permissions: PermissionSet
  /** null = all entities. */
  entityIds: string[] | null
  requiresTwoStep: boolean
}

export type Membership = {
  organizationId: string
  organizationName: string
  member: MemberContext
}

/** What services receive. Organization and member come from the session, never from input. */
export type ServiceContext = {
  db: DbOrTx
  organizationId: string
  organizationName: string
  user: Pick<AuthUser, 'id' | 'name' | 'email'>
  member: MemberContext
  sessionId: string | null
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
  permissions: string[] | null
  entity_ids: string[] | null
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
 * change applies on the next request.
 */
export async function loadMembership(
  db: DbOrTx,
  userId: string,
  preferredOrganizationId: string | null,
): Promise<Membership | null> {
  const result = await db.execute<MembershipRow>(sql`
    select m.id as member_id, m.organization_id, o.name as organization_name,
      r.id as role_id, r.key as role_key, r.name as role_name, r.requires_two_step,
      (select array_agg(rp.module || '.' || rp.action) from role_permissions rp
        where rp.role_id = r.id) as permissions,
      (select array_agg(l.entity_id) from member_entity_limits l
        where l.member_id = m.id) as entity_ids
    from members m
    join roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join organizations o on o.id = m.organization_id
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
    },
  }
}

/** Points the session (and the person's default for new sessions) at an organization. */
export async function setActiveOrganization(
  db: DbOrTx,
  input: { userId: string; sessionId: string | null; organizationId: string },
): Promise<void> {
  if (input.sessionId) {
    await db
      .update(sessions)
      .set({ activeOrganizationId: input.organizationId })
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

/** Two-step is required by the role, or because an owner or admin reset it. */
export function twoStepRequired(
  user: Pick<AuthUser, 'twoStepSetupRequired'>,
  member: Pick<MemberContext, 'requiresTwoStep'> | null,
): boolean {
  return user.twoStepSetupRequired || Boolean(member?.requiresTwoStep)
}
