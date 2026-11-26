import { PASSWORD_RULE_LABELS, type SystemRoleKey, unmetPasswordRules } from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
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
  entities,
  invitations,
  memberEntityLimits,
  members,
  organizationOverrides,
  organizationPlans,
  organizations,
  passwordHistories,
  platformAdmins,
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

type Person = { name: string; email: string; role: SystemRoleKey; onlyEntity?: string }

const PEOPLE: Person[] = [
  { name: 'Olumide Bankole', email: 'olumide@ventohomes.ng', role: 'owner' },
  { name: 'Ngozi Adeyemi', email: 'ngozi@ventohomes.ng', role: 'land_legal' },
  {
    name: 'Kunle Ojo',
    email: 'kunle@ventohomes.ng',
    role: 'project_manager',
    onlyEntity: 'RC 1789234',
  },
  { name: 'Grace Umeh', email: 'grace@ventohomes.ng', role: 'sales' },
  { name: 'Aisha Bello', email: 'aisha@ventohomes.ng', role: 'finance' },
  { name: 'Kemi Adebayo', email: 'kemi@ventohomes.ng', role: 'hr' },
  { name: 'Ope Martins', email: 'ope@ventohomes.ng', role: 'facility' },
  // Accountant in the designs; viewer until custom roles exist (owner's decision 12).
  { name: 'Tunde Ola', email: 'tunde@ventohomes.ng', role: 'viewer' },
]

const INVITES = [
  { email: 'chidi.okafor@ventohomes.ng', role: 'finance', expired: false },
  { email: 'segun.adeleke@ventohomes.ng', role: 'sales', expired: true },
] as const

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
const SUPER_ADMIN = { name: 'Ada Okafor', email: 'ada@vento.ng', role: 'viewer' as const }

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
  input: { organizationId: string; userId: string; roleId: string; entityId?: string },
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
  await tx.update(members).set({ roleId: input.roleId }).where(eq(members.id, memberId))
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
    links.push(
      `${invite.email} (${invite.expired ? 'expired' : 'pending'}): ${webUrl(`/accept-invitation/${token}`)}`,
    )
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
    let ownerId = ''
    for (const person of PEOPLE) {
      const userId = await upsertPerson(tx, person, passwordHash)
      if (person.role === 'owner') ownerId = userId
      await upsertMembership(tx, {
        organizationId,
        userId,
        roleId: roleIds.get(person.role) ?? '',
        entityId: person.onlyEntity ? entityIds.get(person.onlyEntity) : undefined,
      })
    }
    return upsertInvitations(tx, organizationId, roleIds, ownerId)
  })

  await bootstrapStartingData(db)
  await seedLekki(passwordHash)
  const adminSecret = await seedSuperAdmin(passwordHash, password)

  logger.info('Seeded Vento Homes Ltd and Lekki Partners Ltd', {
    people: PEOPLE.length + LEKKI_PEOPLE.length,
  })
  const everyone = [...PEOPLE, ...LEKKI_PEOPLE, SUPER_ADMIN].map((p) => p.email)
  process.stdout.write(
    `\nSign in as any of: ${everyone.join(', ')}\n(password: SEED_PASSWORD from .env)\n\nInvitation links:\n  ${links.join('\n  ')}\n\n`,
  )
  if (adminSecret) {
    process.stdout.write(
      `Super-admin ${SUPER_ADMIN.email}: two-step is on. Add this secret to an authenticator app now; it isn't shown again:\n  ${adminSecret}\n\n`,
    )
  }
}

/** Lekki Partners Ltd: standard, on Starter, at its entity limit, with Commissions released to it. */
async function seedLekki(passwordHash: string) {
  const organizationId = await db.transaction(async (tx) => {
    const id = await upsertOrganization(tx, LEKKI, 'standard')
    const roleIds = await syncSystemRoles(tx, id)
    await upsertEntities(tx, id, LEKKI_ENTITIES)
    for (const person of LEKKI_PEOPLE) {
      const userId = await upsertPerson(tx, person, passwordHash, LEKKI)
      await upsertMembership(tx, {
        organizationId: id,
        userId,
        roleId: roleIds.get(person.role) ?? '',
      })
    }
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

/**
 * ada@vento.ng, a Vento super-admin. Two-step is switched on through Better Auth the way the
 * e2e fixtures do it; returns the authenticator secret the first time only.
 */
async function seedSuperAdmin(passwordHash: string, password: string): Promise<string | null> {
  const userId = await db.transaction((tx) => upsertPerson(tx, SUPER_ADMIN, passwordHash, 'Vento'))
  const [user] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, userId))
  let secret: string | null = null
  if (!user?.twoFactorEnabled) {
    const { testApp, browser } = await import('@/test/auth-client')
    const { setUpTwoStep, signIn } = await import('@/test/flows')
    const b = browser(testApp().app)
    const res = await signIn(b, SUPER_ADMIN.email, password)
    if (res.status !== 200) throw new Error('Super-admin sign-in failed')
    const { totpURI } = await setUpTwoStep(b, password)
    secret = new URL(totpURI).searchParams.get('secret')
  }
  const [admin] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
  if (!admin) await db.insert(platformAdmins).values({ userId, reason: 'Demo super-admin' })
  return secret
}

try {
  await seed()
} catch (error) {
  logger.error('Seed failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
} finally {
  await pool.end()
}
