import {
  customRolePluralName,
  defaultPermissions,
  defaultRole,
  normalisePermissions,
  PASSWORD_RULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionSet,
  type SystemRoleKey,
  unmetPasswordRules,
} from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { setActiveOrganization } from '@/access/context'
import { syncSystemRoles } from '@/access/system-roles'
import { webUrl } from '@/auth/hooks/deps'
import { INVITATION_TTL_MS } from '@/auth/policy'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import { newInvitationToken } from '@/modules/invitations/invitation-token'
import { findPlanVersion } from '@/platform/operations/common'
import { assignPlan } from '@/platform/operations/plans'
import { setReleaseOverride } from '@/platform/operations/release'
import { bootstrapStartingData, SETUP_ACTOR } from '@/platform/seed-plans'
import { type DbOrTx, db, pool } from './client'
import {
  accounts,
  auditEvents,
  entities,
  invitations,
  memberEntityLimits,
  members,
  organizationOverrides,
  organizationPlans,
  organizations,
  passkeys,
  passwordHistories,
  platformAdmins,
  rolePermissions,
  roles,
  staffInvitations,
  users,
} from './schema'

// Demo data from docs/design/DESIGN-NOTES.md for local development and demos. Run by hand
// (`pnpm db:seed`), never on app start, never in production. Safe to run again: it upserts.

const ORGANIZATION = 'Vento Homes Ltd'

const ENTITIES = [
  {
    name: 'Victoria Gardens Dev. Ltd',
    type: 'holding',
    rcNumber: 'RC 1652310',
    tin: '1652310-0001',
  },
  { name: 'Parkview Residences SPV Ltd', type: 'spv', rcNumber: 'RC 1789234', tin: '1789234-0001' },
  { name: 'Lekki Pearl Estates Ltd', type: 'spv', rcNumber: 'RC 1904417', tin: null },
] as const

type Person = {
  name: string
  email: string
  role: SystemRoleKey
  /** A custom role by name; `role` is then unused for access. */
  customRole?: string
  onlyEntity?: string
  /** Team page "Last active": days ago, or null for never since joining. */
  activeDaysAgo?: number | null
}

const PEOPLE: Person[] = [
  { name: 'Olumide Bankole', email: 'olumide@ventohomes.ng', role: 'owner', activeDaysAgo: 0 },
  { name: 'Ngozi Adeyemi', email: 'ngozi@ventohomes.ng', role: 'land_legal', activeDaysAgo: 1 },
  {
    name: 'Kunle Ojo',
    email: 'kunle@ventohomes.ng',
    role: 'project_manager',
    onlyEntity: 'RC 1789234',
    activeDaysAgo: 3,
  },
  { name: 'Grace Umeh', email: 'grace@ventohomes.ng', role: 'sales', activeDaysAgo: 0 },
  { name: 'Aisha Bello', email: 'aisha@ventohomes.ng', role: 'finance', activeDaysAgo: 2 },
  { name: 'Kemi Adebayo', email: 'kemi@ventohomes.ng', role: 'hr', activeDaysAgo: 14 },
  { name: 'Ope Martins', email: 'ope@ventohomes.ng', role: 'facility', activeDaysAgo: null },
  // Accountant in the designs; viewer until custom roles exist (owner's decision 12).
  { name: 'Tunde Ola', email: 'tunde@ventohomes.ng', role: 'viewer', activeDaysAgo: 6 },
  // An admin limited to Parkview: sees only Parkview's names on Team and manages only its people.
  {
    name: 'Funmi Akande',
    email: 'funmi@ventohomes.ng',
    role: 'admin',
    onlyEntity: 'RC 1789234',
    activeDaysAgo: 1,
  },
  // Holds the custom "Site engineer" role (J-ONB-08). Not "Emeka": Emeka Nwosu is the removed member.
  {
    name: 'Bayo Ogunleye',
    email: 'bayo@ventohomes.ng',
    role: 'viewer',
    customRole: 'Site engineer',
    onlyEntity: 'RC 1789234',
    activeDaysAgo: 1,
  },
]

/** Brick 3c custom roles. Auditor is held by nobody, so Delete role is offered on it. */
function siteEngineerPermissions(): PermissionSet {
  const set = defaultPermissions(defaultRole('project_manager'))
  set.land = []
  set.sales = []
  set.documents = ['view', 'create']
  return set
}

const CUSTOM_ROLES: {
  name: string
  description: string
  requiresTwoStep: boolean
  permissions: () => PermissionSet
}[] = [
  {
    name: 'Site engineer',
    description: 'Based on Project manager',
    requiresTwoStep: false,
    permissions: siteEngineerPermissions,
  },
  {
    name: 'Auditor',
    description: 'Based on Viewer',
    requiresTwoStep: false,
    permissions: () =>
      normalisePermissions(Object.fromEntries(PERMISSION_MODULES.map((m) => [m, ['view']]))),
  },
]

/** An SPV wound up a month ago: the Archived chip, "Archived … by …" and the RC clash. */
const ARCHIVED_ENTITY = {
  name: 'Ikoyi Crest SPV Ltd',
  type: 'spv',
  rcNumber: 'RC 1832276',
  tin: null,
} as const

/** Someone who left, for the Team page's Removed chip. */
const REMOVED = { name: 'Emeka Nwosu', email: 'emeka@ventohomes.ng', role: 'sales' } as const

const INVITES = [
  { email: 'chidi.okafor@ventohomes.ng', role: 'finance', expired: false, delivery: 'sent' },
  { email: 'segun.adeleke@ventohomes.ng', role: 'sales', expired: true, delivery: 'sent' },
  // Shows "Email not delivered" on Team.
  { email: 'yemi.ade@ventohomes.ng', role: 'sales', expired: false, delivery: 'bounced' },
] as const

const DAY_MS = 24 * 3600_000

/** By name among live roles (the partial unique index); permissions replaced, as syncSystemRoles. */
async function upsertCustomRoles(tx: DbOrTx, organizationId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const role of CUSTOM_ROLES) {
    const values = {
      name: role.name,
      pluralName: customRolePluralName(role.name),
      description: role.description,
      requiresTwoStep: role.requiresTwoStep,
    }
    const [existing] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, organizationId),
          isNull(roles.archivedAt),
          sql`lower(${roles.name}) = lower(${role.name})`,
        ),
      )
    const id =
      existing?.id ??
      (
        await tx
          .insert(roles)
          .values({ ...values, organizationId, key: null, isSystem: false })
          .returning({ id: roles.id })
      )[0]?.id
    if (!id) throw new Error(`Role insert failed for ${role.name}`)
    if (existing) await tx.update(roles).set(values).where(eq(roles.id, id))
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id))
    const set = role.permissions()
    await tx.insert(rolePermissions).values(
      PERMISSION_MODULES.flatMap((module) =>
        PERMISSION_ACTIONS.filter((a) => set[module].includes(a)).map((action) => ({
          organizationId,
          roleId: id,
          module,
          action,
        })),
      ),
    )
    ids.set(role.name, id)
  }
  return ids
}

/** Archived once, 30 days ago by the owner, with its audit row; left alone after that. */
async function upsertArchivedEntity(tx: DbOrTx, organizationId: string, ownerId: string) {
  const ids = await upsertEntities(tx, organizationId, [ARCHIVED_ENTITY])
  const id = ids.get(ARCHIVED_ENTITY.rcNumber)
  if (!id) throw new Error('Archived entity insert failed')
  const archivedAt = new Date(Date.now() - 30 * DAY_MS)
  const [row] = await tx
    .update(entities)
    .set({ status: 'archived', archivedAt, archivedByUserId: ownerId })
    .where(and(eq(entities.id, id), eq(entities.status, 'active')))
    .returning({ id: entities.id })
  if (!row) return
  const [owner] = await tx.select({ name: users.name }).from(users).where(eq(users.id, ownerId))
  await tx.insert(auditEvents).values({
    organizationId,
    actorUserId: ownerId,
    actorName: owner?.name ?? 'Olumide Bankole',
    action: 'entity.archived',
    targetType: 'entity',
    targetId: id,
    targetLabel: ARCHIVED_ENTITY.name,
    before: { status: 'active' },
    after: { status: 'archived' },
    metadata: { membersOnlyThisEntity: 0 },
    createdAt: archivedAt,
    updatedAt: archivedAt,
  })
}

async function upsertOrganization(
  tx: DbOrTx,
  name: string = ORGANIZATION,
  releaseGroup: 'standard' | 'internal' = 'internal',
): Promise<string> {
  const [existing] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
  const id =
    existing?.id ??
    (
      await tx
        .insert(organizations)
        .values({ name, headOfficeState: 'Lagos', financialYearStartMonth: 1 })
        .returning({ id: organizations.id })
    )[0]?.id
  if (!id) throw new Error('Organization insert failed')
  await tx
    .insert(organizationPlans)
    .values({ organizationId: id, releaseGroup })
    .onConflictDoUpdate({ target: organizationPlans.organizationId, set: { releaseGroup } })
  return id
}

// A second developer on Starter, so plan behaviour shows locally (spec: development and tests).
const LEKKI = 'Lekki Partners Ltd'
const LEKKI_ENTITIES = [
  { name: 'Lekki Partners Holdings Ltd', type: 'holding', rcNumber: 'RC 2011458', tin: null },
  { name: 'Lekki Pearl Residences SPV Ltd', type: 'spv', rcNumber: 'RC 2011459', tin: null },
] as const
const LEKKI_PEOPLE: Person[] = [
  { name: 'Bisi Lawal', email: 'bisi@lekkipartners.ng', role: 'owner' },
  { name: 'Femi Adeoye', email: 'femi@lekkipartners.ng', role: 'sales' },
]
// Vento Real Estate staff (admin-console plan §1b.17): staff accounts with no organization, so
// signing in lands them on the console. Chika has an open staff invitation from Ada.
const SUPER_ADMINS = [
  { name: 'Ada Okafor', email: 'ada@ventoerp.com' },
  { name: 'Tunde Bello', email: 'tunde@ventoerp.com' },
] as const
const STAFF_INVITEE = { name: 'Chika Obi', email: 'chika@ventoerp.com' } as const

/** What to run when the local database predates staff accounts (the kind can't be changed). */
const STALE_STAFF_MESSAGE = `This local database is from before staff accounts: ada@ventoerp.com is still a customer account, and an account's kind can't change. Reset the local database (this deletes your local development data) and seed again:
  docker compose down -v && pnpm db:up && pnpm db:migrate && pnpm db:seed`

async function upsertEntities(
  tx: DbOrTx,
  organizationId: string,
  list: readonly {
    name: string
    type: 'holding' | 'spv'
    rcNumber: string
    tin: string | null
  }[] = ENTITIES,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const e of list) {
    const [row] = await tx
      .insert(entities)
      .values({ ...e, organizationId, vatRegistered: e.type === 'spv' })
      .onConflictDoUpdate({
        target: [entities.organizationId, entities.rcNumber],
        targetWhere: isNotNull(entities.rcNumber),
        set: { name: e.name, type: e.type },
      })
      .returning({ id: entities.id })
    if (row) ids.set(e.rcNumber, row.id)
  }
  return ids
}

async function upsertPerson(
  tx: DbOrTx,
  person: Pick<Person, 'name' | 'email'>,
  passwordHash: string,
  companyName: string = ORGANIZATION,
): Promise<string> {
  const [user] = await tx
    .insert(users)
    .values({
      name: person.name,
      email: person.email,
      emailVerified: true,
      companyName,
    })
    .onConflictDoUpdate({ target: users.email, set: { name: person.name, emailVerified: true } })
    .returning({ id: users.id })
  if (!user) throw new Error(`User insert failed for ${person.email}`)
  const [account] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
  if (account) {
    await tx.update(accounts).set({ password: passwordHash }).where(eq(accounts.id, account.id))
  } else {
    await tx.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: passwordHash,
    })
    await tx.insert(passwordHistories).values({ userId: user.id, passwordHash })
  }
  return user.id
}

async function upsertMembership(
  tx: DbOrTx,
  input: {
    organizationId: string
    userId: string
    roleId: string
    entityId?: string
    activeDaysAgo?: number | null
  },
) {
  const [existing] = await tx
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, input.organizationId),
        eq(members.userId, input.userId),
        eq(members.status, 'active'),
      ),
    )
  const memberId =
    existing?.id ??
    (
      await tx
        .insert(members)
        .values({
          organizationId: input.organizationId,
          userId: input.userId,
          roleId: input.roleId,
        })
        .returning({ id: members.id })
    )[0]?.id
  if (!memberId) throw new Error('Member insert failed')
  const lastActiveAt =
    input.activeDaysAgo === undefined || input.activeDaysAgo === null
      ? null
      : new Date(Date.now() - input.activeDaysAgo * DAY_MS)
  await tx
    .update(members)
    .set({ roleId: input.roleId, lastActiveAt })
    .where(eq(members.id, memberId))
  await tx.delete(memberEntityLimits).where(eq(memberEntityLimits.memberId, memberId))
  if (input.entityId) {
    await tx
      .insert(memberEntityLimits)
      .values({ organizationId: input.organizationId, memberId, entityId: input.entityId })
  }
  await setActiveOrganization(tx, {
    userId: input.userId,
    sessionId: null,
    organizationId: input.organizationId,
  })
}

/** A removed membership (once), removed by the owner five days ago. */
async function upsertRemoved(
  tx: DbOrTx,
  input: { organizationId: string; userId: string; roleId: string; ownerId: string },
) {
  const [existing] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, input.organizationId), eq(members.userId, input.userId)))
  if (existing) return
  const removedAt = new Date(Date.now() - 5 * DAY_MS)
  await tx.insert(members).values({
    organizationId: input.organizationId,
    userId: input.userId,
    roleId: input.roleId,
    status: 'removed',
    joinedAt: new Date(Date.now() - 90 * DAY_MS),
    removedAt,
    removedByUserId: input.ownerId,
  })
}

/** Gives each demo invitation a fresh link (only hashes are stored, so old links can't be shown). */
async function upsertInvitations(
  tx: DbOrTx,
  organizationId: string,
  roleIds: Map<string, string>,
  ownerId: string,
) {
  const links: string[] = []
  for (const invite of INVITES) {
    const { token, tokenHash } = newInvitationToken()
    const expiresAt = new Date(Date.now() + (invite.expired ? -24 * 3600_000 : INVITATION_TTL_MS))
    const values = {
      status: 'pending' as const,
      tokenHash,
      expiresAt,
      lastSentAt: new Date(),
      roleId: roleIds.get(invite.role) ?? '',
      delivery: invite.delivery,
      deliveryChangedAt: new Date(),
      deliveryMessageId: null,
    }
    const [existing] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(eq(invitations.organizationId, organizationId), eq(invitations.email, invite.email)),
      )
    if (existing) await tx.update(invitations).set(values).where(eq(invitations.id, existing.id))
    else
      await tx
        .insert(invitations)
        .values({ ...values, organizationId, email: invite.email, invitedByUserId: ownerId })
    const state = invite.expired ? 'expired' : invite.delivery === 'bounced' ? 'bounced' : 'pending'
    links.push(`${invite.email} (${state}): ${webUrl(`/accept-invitation/${token}`)}`)
  }
  return links
}

async function seed() {
  if (env.NODE_ENV === 'production') throw new Error('The seed is for development only')
  const password = env.SEED_PASSWORD
  if (!password) throw new Error('Set SEED_PASSWORD in .env (see .env.example)')
  const missing = unmetPasswordRules(password)
  if (missing.length > 0) {
    // Names the missing rules only; never echoes the password.
    const rules = missing.map((rule) => PASSWORD_RULE_LABELS[rule].toLowerCase()).join('; ')
    throw new Error(
      `SEED_PASSWORD must meet the password rules: at least 8 characters, an uppercase letter, a lowercase letter, a number and a special character. Missing: ${rules}. Update it in .env.`,
    )
  }
  const passwordHash = await hashPassword(password)

  const links = await db.transaction(async (tx) => {
    const organizationId = await upsertOrganization(tx)
    const roleIds = await syncSystemRoles(tx, organizationId)
    const entityIds = await upsertEntities(tx, organizationId)
    const customRoleIds = await upsertCustomRoles(tx, organizationId)
    let ownerId = ''
    for (const person of PEOPLE) {
      const userId = await upsertPerson(tx, person, passwordHash)
      if (person.role === 'owner') ownerId = userId
      await upsertMembership(tx, {
        organizationId,
        userId,
        roleId: person.customRole
          ? (customRoleIds.get(person.customRole) ?? '')
          : (roleIds.get(person.role) ?? ''),
        entityId: person.onlyEntity ? entityIds.get(person.onlyEntity) : undefined,
        activeDaysAgo: person.activeDaysAgo,
      })
    }
    await upsertRemoved(tx, {
      organizationId,
      userId: await upsertPerson(tx, REMOVED, passwordHash),
      roleId: roleIds.get(REMOVED.role) ?? '',
      ownerId,
    })
    await upsertArchivedEntity(tx, organizationId, ownerId)
    await upsertDisplayPasskey(tx)
    return upsertInvitations(tx, organizationId, roleIds, ownerId)
  })

  await bootstrapStartingData(db)
  await seedLekki(passwordHash)
  const adminSecrets: [string, string][] = []
  for (const admin of SUPER_ADMINS) {
    const secret = await seedSuperAdmin(admin, passwordHash, password)
    if (secret) adminSecrets.push([admin.email, secret])
  }
  const staffLink = await seedStaffInvitation()

  logger.info('Seeded Vento Homes Ltd and Lekki Partners Ltd', {
    people: PEOPLE.length + LEKKI_PEOPLE.length,
    customRoles: CUSTOM_ROLES.map((r) => r.name),
    archivedCompanies: [ARCHIVED_ENTITY.name],
  })
  const everyone = [...PEOPLE, ...LEKKI_PEOPLE, ...SUPER_ADMINS].map((p) => p.email)
  process.stdout.write(
    `\nSign in as any of: ${everyone.join(', ')}\n(password: SEED_PASSWORD from .env)\n\nInvitation links:\n  ${links.join('\n  ')}\n\n`,
  )
  process.stdout.write(
    `Staff invitation for ${STAFF_INVITEE.name} (${STAFF_INVITEE.email}), new each run:\n  ${staffLink}\n\n`,
  )
  for (const [email, secret] of adminSecrets) {
    process.stdout.write(
      `Super-admin ${email}: two-step is on. Add this secret to an authenticator app now; it isn't shown again:\n  ${secret}\n\n`,
    )
  }
}

/**
 * Aisha's passkey on My security and Team ("1 passkey", the reset copy). DISPLAY ONLY: no device
 * holds its private key, so it can never sign in; the public key is a throwaway. For a real
 * passkey sign-in in a demo, add one on your own device.
 */
async function upsertDisplayPasskey(tx: DbOrTx): Promise<void> {
  const [aisha] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'aisha@ventohomes.ng'))
  if (!aisha) return
  await tx
    .insert(passkeys)
    .values({
      userId: aisha.id,
      name: 'iCloud Keychain · iPhone',
      publicKey: 'c2VlZC1kaXNwbGF5LW9ubHktbm90LWEta2V5',
      credentialID: 'seed-display-only-aisha-iphone',
      counter: 0,
      deviceType: 'multiDevice',
      backedUp: true,
      transports: 'internal',
      createdAt: new Date(Date.now() - 20 * DAY_MS),
      lastUsedAt: new Date(Date.now() - DAY_MS),
    })
    .onConflictDoNothing({ target: passkeys.credentialID })
}

/**
 * Lekki Partners Ltd: standard, on Starter, at its entity limit, with Commissions released to
 * it, and "Require two-step for everyone" turned on by Bisi Lawal 2 days ago: Femi Adeoye (sales,
 * no two-step) sees the banner with 5 days left, and a new sign-in as Femi asks for setup first.
 * Vento Homes Ltd stays off, so the golden-thread sign-ins aren't interrupted.
 */
async function seedLekki(passwordHash: string) {
  const organizationId = await db.transaction(async (tx) => {
    const id = await upsertOrganization(tx, LEKKI, 'standard')
    const roleIds = await syncSystemRoles(tx, id)
    await upsertEntities(tx, id, LEKKI_ENTITIES)
    let bisiId: string | null = null
    for (const person of LEKKI_PEOPLE) {
      const userId = await upsertPerson(tx, person, passwordHash, LEKKI)
      if (person.role === 'owner') bisiId = userId
      await upsertMembership(tx, {
        organizationId: id,
        userId,
        roleId: roleIds.get(person.role) ?? '',
      })
    }
    await tx
      .update(organizations)
      .set({
        twoStepRequiredForEveryone: true,
        twoStepRequiredChangedAt: new Date(Date.now() - 2 * DAY_MS),
        twoStepRequiredChangedByUserId: bisiId,
      })
      .where(and(eq(organizations.id, id), eq(organizations.twoStepRequiredForEveryone, false)))
    return id
  })
  const organization = { id: organizationId, name: LEKKI }
  const [plan] = await db
    .select({ planVersionId: organizationPlans.planVersionId })
    .from(organizationPlans)
    .where(eq(organizationPlans.organizationId, organizationId))
  const starter = await findPlanVersion(db, 'starter')
  if (plan?.planVersionId !== starter.versionId) {
    await assignPlan(db, SETUP_ACTOR, { organization, target: starter, reason: 'Demo data' })
  }
  // Shows the owner's "Commissions · Available on Growth" hint locally.
  const [override] = await db
    .select({ id: organizationOverrides.id })
    .from(organizationOverrides)
    .where(
      and(
        eq(organizationOverrides.organizationId, organizationId),
        eq(organizationOverrides.key, 'sales.commissions'),
        isNull(organizationOverrides.clearedAt),
      ),
    )
  if (!override) {
    await setReleaseOverride(db, SETUP_ACTOR, {
      organization,
      key: 'sales.commissions',
      value: 'on',
      reason: 'Demo data',
    })
  }
}

/** Stops with the reset instructions rather than half-converting a pre-1b local database. */
async function assertNoStaleStaff(): Promise<void> {
  const emails = SUPER_ADMINS.map((a) => a.email)
  const stale = await db
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.email, emails), eq(users.accountKind, 'customer')))
  if (stale.length) throw new Error(STALE_STAFF_MESSAGE)
}

/**
 * A super-admin: a staff account with no organization (decision 0023). Two-step is switched on
 * through Better Auth the way the e2e fixtures do it; returns the authenticator secret the first
 * time only. The platform_admins row comes first, so the staff sign-in guard lets them in.
 */
async function seedSuperAdmin(
  admin: (typeof SUPER_ADMINS)[number],
  passwordHash: string,
  password: string,
): Promise<string | null> {
  await assertNoStaleStaff()
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name: admin.name, email: admin.email, emailVerified: true, accountKind: 'staff' })
      .onConflictDoUpdate({ target: users.email, set: { name: admin.name, emailVerified: true } })
      .returning({ id: users.id })
    if (!user) throw new Error(`User insert failed for ${admin.email}`)
    const [account] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
    if (account) {
      await tx.update(accounts).set({ password: passwordHash }).where(eq(accounts.id, account.id))
    } else {
      await tx.insert(accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      })
      await tx.insert(passwordHistories).values({ userId: user.id, passwordHash })
    }
    const [row] = await tx
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.revokedAt)))
    if (!row)
      await tx.insert(platformAdmins).values({ userId: user.id, reason: 'Demo super-admin' })
    return user.id
  })
  const [user] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, userId))
  if (user?.twoFactorEnabled) return null
  const { testApp, browser } = await import('@/test/auth-client')
  const { setUpTwoStep, signIn } = await import('@/test/flows')
  const b = browser(testApp().app)
  const res = await signIn(b, admin.email, password)
  if (res.status !== 200) throw new Error(`Super-admin sign-in failed for ${admin.email}`)
  const { totpURI } = await setUpTwoStep(b, password)
  return new URL(totpURI).searchParams.get('secret')
}

/** Chika's open staff invitation from Ada: a fresh link and 48 hours on every run. */
async function seedStaffInvitation(): Promise<string> {
  const { newInvitationToken } = await import('@/modules/invitations/invitation-token')
  const { staffInvitationLink } = await import('@/platform/operations/staff-invitations')
  const { STAFF_INVITATION_TTL_MS } = await import('@/auth/policy')
  const { token, tokenHash } = newInvitationToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + STAFF_INVITATION_TTL_MS)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
    const [ada] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'ada@ventoerp.com'))
    const [open] = await tx
      .select({ id: staffInvitations.id })
      .from(staffInvitations)
      .where(
        and(
          eq(staffInvitations.email, STAFF_INVITEE.email),
          eq(staffInvitations.status, 'pending'),
        ),
      )
    if (open) {
      await tx
        .update(staffInvitations)
        .set({ tokenHash, expiresAt, lastSentAt: now, userId: null, startedAt: null })
        .where(eq(staffInvitations.id, open.id))
    } else {
      await tx.insert(staffInvitations).values({
        ...STAFF_INVITEE,
        reason: 'Joins the release rota',
        invitedByUserId: ada?.id ?? null,
        tokenHash,
        expiresAt,
        lastSentAt: now,
      })
    }
  })
  return staffInvitationLink(token)
}

try {
  await seed()
} catch (error) {
  // Instructions for the developer, readable as is (not only inside the log line).
  if (error instanceof Error && error.message === STALE_STAFF_MESSAGE) {
    process.stderr.write(`\n${STALE_STAFF_MESSAGE}\n\n`)
  }
  logger.error('Seed failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
} finally {
  await pool.end()
}
