import type { SystemRoleKey } from '@vento/shared'
import { DEFAULT_ROLES } from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { loadMembership, type ServiceContext } from '@/access/context'
import { syncSystemRoles } from '@/access/system-roles'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  entities,
  invitationEntityLimits,
  invitations,
  memberEntityLimits,
  members,
  organizations,
  passwordHistories,
  sessions,
  users,
} from '@/db/schema'
import { newInvitationToken } from '@/modules/invitations/invitation-token'
import { uniqueEmail } from './db'

// Meets every password rule; apps/web/e2e signs up with the same literal.
export const TEST_PASSWORD = 'Parkview-gate-2026'

export type TestUser = typeof users.$inferSelect

export async function createUser(
  db: DbOrTx,
  overrides: Partial<typeof users.$inferInsert> & { password?: string } = {},
): Promise<TestUser> {
  const { password, ...fields } = overrides
  const [user] = await db
    .insert(users)
    .values({ name: 'Aisha Bello', email: uniqueEmail('aisha'), emailVerified: true, ...fields })
    .returning()
  if (!user) throw new Error('user insert failed')
  if (password) {
    const hash = await hashPassword(password)
    await db
      .insert(accounts)
      .values({ accountId: user.id, providerId: 'credential', userId: user.id, password: hash })
    await db.insert(passwordHistories).values({ userId: user.id, passwordHash: hash })
  }
  return user
}

export type TestOrg = {
  id: string
  name: string
  roleIds: Map<string, string>
  owner: TestUser
  ownerMemberId: string
}

/** An organization with the nine roles and an owner (two-step on, so member procedures work). */
export async function createOrganization(
  db: DbOrTx,
  overrides: { name?: string; owner?: TestUser } = {},
): Promise<TestOrg> {
  const [org] = await db
    .insert(organizations)
    .values({ name: overrides.name ?? 'Vento Homes Ltd', headOfficeState: 'Lagos' })
    .returning()
  if (!org) throw new Error('org insert failed')
  const roleIds = await syncSystemRoles(db, org.id)
  const owner =
    overrides.owner ??
    (await createUser(db, {
      name: 'Olumide Bankole',
      email: uniqueEmail('olumide'),
      twoFactorEnabled: true,
    }))
  const [member] = await db
    .insert(members)
    .values({ organizationId: org.id, userId: owner.id, roleId: roleIds.get('owner') ?? '' })
    .returning()
  if (!member) throw new Error('member insert failed')
  return { id: org.id, name: org.name, roleIds, owner, ownerMemberId: member.id }
}

export async function createEntity(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  overrides: Partial<typeof entities.$inferInsert> = {},
) {
  const [row] = await db
    .insert(entities)
    .values({
      name: 'Parkview Residences SPV Ltd',
      type: 'spv',
      ...overrides,
      organizationId: org.id,
    })
    .returning()
  if (!row) throw new Error('entity insert failed')
  return row
}

const twoStepRoles = new Set(DEFAULT_ROLES.filter((r) => r.requiresTwoStep).map((r) => r.key))

/** A member with a built-in role. Roles that require two-step get it switched on. */
export async function createMember(
  db: DbOrTx,
  org: TestOrg,
  options: { role: SystemRoleKey; entityIds?: string[]; user?: TestUser; name?: string },
) {
  const user =
    options.user ??
    (await createUser(db, {
      name: options.name ?? `${options.role} person`,
      email: uniqueEmail(options.role),
      twoFactorEnabled: twoStepRoles.has(options.role),
    }))
  const [member] = await db
    .insert(members)
    .values({
      organizationId: org.id,
      userId: user.id,
      roleId: org.roleIds.get(options.role) ?? '',
    })
    .returning()
  if (!member) throw new Error('member insert failed')
  if (options.entityIds?.length) {
    await db.insert(memberEntityLimits).values(
      options.entityIds.map((entityId) => ({
        organizationId: org.id,
        memberId: member.id,
        entityId,
      })),
    )
  }
  return { user, member }
}

export async function createInvitation(
  db: DbOrTx,
  org: TestOrg,
  options: {
    role: SystemRoleKey
    email?: string
    status?: (typeof invitations.$inferInsert)['status']
    expiresAt?: Date
    entityIds?: string[]
  },
) {
  const { token, tokenHash } = newInvitationToken()
  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: org.id,
      email: options.email ?? uniqueEmail('invitee'),
      roleId: org.roleIds.get(options.role) ?? '',
      invitedByUserId: org.owner.id,
      status: options.status ?? 'pending',
      tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600_000),
    })
    .returning()
  if (!invitation) throw new Error('invitation insert failed')
  if (options.entityIds?.length) {
    await db.insert(invitationEntityLimits).values(
      options.entityIds.map((entityId) => ({
        organizationId: org.id,
        invitationId: invitation.id,
        entityId,
      })),
    )
  }
  return { invitation, token }
}

export async function createSession(
  db: DbOrTx,
  user: TestUser,
  overrides: Partial<typeof sessions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      token: `t-${Math.random().toString(36).slice(2)}${Date.now()}`,
      expiresAt: new Date(Date.now() + 12 * 3600_000),
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('session insert failed')
  return row
}

/** The service context a signed-in member gets, loaded the same way the middleware does. */
export async function contextFor(
  db: DbOrTx,
  user: TestUser,
  org: Pick<TestOrg, 'id'>,
): Promise<ServiceContext> {
  const membership = await loadMembership(db, user.id, org.id)
  if (!membership || membership.organizationId !== org.id) throw new Error('not a member')
  return {
    db,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    user: { id: user.id, name: user.name, email: user.email },
    member: membership.member,
    sessionId: null,
  }
}

export async function reloadUser(db: DbOrTx, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}
