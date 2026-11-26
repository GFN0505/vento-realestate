import type { PermissionSet, SystemRoleKey } from '@vento/shared'
import {
  customRolePluralName,
  DEFAULT_ROLES,
  defaultPermissions,
  normalisePermissions,
  PERMISSION_MODULES,
} from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { loadMembership, type ServiceContext } from '@/access/context'
import { syncSystemRoles } from '@/access/system-roles'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  entities,
  featureReleases,
  invitationEntityLimits,
  invitations,
  memberEntityLimits,
  members,
  organizationAddOns,
  organizationOverrides,
  organizationPlans,
  organizations,
  passwordHistories,
  platformAdmins,
  rolePermissions,
  roles,
  sessions,
  users,
} from '@/db/schema'
import { newInvitationToken } from '@/modules/invitations/invitation-token'
import type { OverrideKind } from '@/platform/availability'
import { findPlanVersion } from '@/platform/operations/common'
import { seedPlans } from '@/platform/seed-plans'
import { availabilityForOrganization } from '@/platform/snapshot'
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

/**
 * An organization with the nine roles and an owner (two-step on, so member procedures work).
 * It's `internal` (everything, no limits) unless a release group or plan is given, so tests
 * about other things never trip over availability.
 */
export async function createOrganization(
  db: DbOrTx,
  overrides: {
    name?: string
    owner?: TestUser
    releaseGroup?: 'standard' | 'pilot' | 'internal'
    /** `starter`, `growth` or `enterprise` (published if missing). */
    planKey?: string
  } = {},
): Promise<TestOrg> {
  const [org] = await db
    .insert(organizations)
    .values({ name: overrides.name ?? 'Vento Homes Ltd', headOfficeState: 'Lagos' })
    .returning()
  if (!org) throw new Error('org insert failed')
  let planVersionId: string | null = null
  if (overrides.planKey) {
    await seedPlans(db)
    planVersionId = (await findPlanVersion(db, overrides.planKey)).versionId
  }
  await db.insert(organizationPlans).values({
    organizationId: org.id,
    releaseGroup: overrides.releaseGroup ?? (overrides.planKey ? 'standard' : 'internal'),
    planVersionId,
    planAssignedAt: planVersionId ? new Date() : null,
  })
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
    .values({
      organizationId: org.id,
      userId: owner.id,
      roleId: roleIds.get('owner') ?? '',
      // Active now, so the hourly activity write doesn't show up in query counts.
      lastActiveAt: new Date(),
    })
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

/** A member with a built-in role, or a custom one by id. Roles that require two-step get it on. */
export async function createMember(
  db: DbOrTx,
  org: TestOrg,
  options: {
    role: SystemRoleKey
    /** A custom role's id; `role` then only names the person and their two-step. */
    roleId?: string
    entityIds?: string[]
    user?: TestUser
    name?: string
    /** Defaults to now; null for someone who never came back after joining. */
    lastActiveAt?: Date | null
  },
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
      roleId: options.roleId ?? org.roleIds.get(options.role) ?? '',
      lastActiveAt: options.lastActiveAt === undefined ? new Date() : options.lastActiveAt,
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
    /** A custom role's id instead of the built-in one. */
    roleId?: string
    email?: string
    status?: (typeof invitations.$inferInsert)['status']
    expiresAt?: Date
    entityIds?: string[]
    /** Defaults to 5 minutes ago, so a resend isn't caught by the once-a-minute rule. */
    lastSentAt?: Date
    delivery?: (typeof invitations.$inferInsert)['delivery']
    invitedBy?: TestUser
  },
) {
  const { token, tokenHash } = newInvitationToken()
  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: org.id,
      email: options.email ?? uniqueEmail('invitee'),
      roleId: options.roleId ?? org.roleIds.get(options.role) ?? '',
      invitedByUserId: (options.invitedBy ?? org.owner).id,
      status: options.status ?? 'pending',
      tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600_000),
      lastSentAt: options.lastSentAt ?? new Date(Date.now() - 5 * 60_000),
      delivery: options.delivery ?? 'sent',
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
    features: await availabilityForOrganization(db, membership.organizationId),
  }
}

/** Sets a flag's release stage for everyone (inside the test's transaction only). */
export async function setStage(
  db: DbOrTx,
  key: string,
  stage: 'off' | 'internal' | 'pilot' | 'on',
): Promise<void> {
  await db
    .insert(featureReleases)
    .values({ featureKey: key, stage, reason: 'test' })
    .onConflictDoUpdate({ target: featureReleases.featureKey, set: { stage } })
}

/** A live override for one organization, without going through the commands. */
export async function setOverride(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  input: {
    kind: OverrideKind
    key: string
    enabled?: boolean
    limitValue?: string | null
    expiresAt?: Date | null
  },
): Promise<void> {
  await db.insert(organizationOverrides).values({
    organizationId: org.id,
    kind: input.kind,
    key: input.key,
    enabled: input.kind === 'limit' ? null : (input.enabled ?? true),
    limitValue: input.kind === 'limit' ? (input.limitValue ?? null) : null,
    expiresAt: input.expiresAt ?? null,
    reason: 'test',
  })
}

export async function addAddOnRow(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  input: { addOnKey?: string; budget?: string } = {},
): Promise<void> {
  await db.insert(organizationAddOns).values({
    organizationId: org.id,
    addOnKey: input.addOnKey ?? 'ai',
    limitIncreases: { ai_budget: input.budget ?? '150000.00' },
    reason: 'test',
  })
}

export async function reloadUser(db: DbOrTx, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}

/** A Vento super-admin (two-step on), for the flag and plan commands. */
export async function createSuperAdmin(
  db: DbOrTx,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<TestUser> {
  const user = await createUser(db, {
    name: 'Ada Okafor',
    email: uniqueEmail('ada'),
    twoFactorEnabled: true,
    ...overrides,
  })
  await db.insert(platformAdmins).values({ userId: user.id, reason: 'test' })
  return user
}

/**
 * A custom role, straight into the tables (the roles service is what's under test elsewhere).
 * Permissions are normalised (any action adds view).
 */
export async function createCustomRole(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  options: {
    name?: string
    permissions: Partial<PermissionSet>
    requiresTwoStep?: boolean
    archivedAt?: Date
  },
) {
  const name = options.name ?? 'Site engineer'
  const [role] = await db
    .insert(roles)
    .values({
      organizationId: org.id,
      key: null,
      isSystem: false,
      name,
      pluralName: customRolePluralName(name),
      description: 'Based on Project manager',
      requiresTwoStep: options.requiresTwoStep ?? false,
      archivedAt: options.archivedAt ?? null,
    })
    .returning()
  if (!role) throw new Error('role insert failed')
  const set = normalisePermissions(options.permissions)
  const rows = PERMISSION_MODULES.flatMap((module) =>
    set[module].map((action) => ({ organizationId: org.id, roleId: role.id, module, action })),
  )
  if (rows.length) await db.insert(rolePermissions).values(rows)
  return role
}

/** Archives an entity the way the service does, by someone. */
export async function archiveEntityRow(
  db: DbOrTx,
  entity: { id: string },
  by: Pick<TestUser, 'id'> | null = null,
) {
  const [row] = await db
    .update(entities)
    .set({ status: 'archived', archivedAt: new Date(), archivedByUserId: by?.id ?? null })
    .where(eq(entities.id, entity.id))
    .returning()
  if (!row) throw new Error('entity archive failed')
  return row
}

/**
 * The ceiling's standard case: a custom "Office manager" with Settings create, edit and delete
 * plus everything Sales has, and no Finance or HR (two-step on, as the role requires it).
 */
export async function createOfficeManager(db: DbOrTx, org: TestOrg) {
  const permissions = defaultPermissionsFor('sales')
  permissions.settings = ['view', 'create', 'edit', 'delete']
  const role = await createCustomRole(db, org, {
    name: 'Office manager',
    permissions,
    requiresTwoStep: true,
  })
  const holder = await createMember(db, org, {
    role: 'admin',
    roleId: role.id,
    name: 'Ngozi Eze',
  })
  return { role, ...holder }
}

function defaultPermissionsFor(key: SystemRoleKey): PermissionSet {
  const role = DEFAULT_ROLES.find((r) => r.key === key)
  if (!role) throw new Error(`Unknown role ${key}`)
  return defaultPermissions(role)
}
