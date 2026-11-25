import type { SystemRoleKey } from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, isNotNull } from 'drizzle-orm'
import { setActiveOrganization } from '@/access/context'
import { syncSystemRoles } from '@/access/system-roles'
import { webUrl } from '@/auth/hooks/deps'
import { checkPasswordPolicy } from '@/auth/password-policy'
import { INVITATION_TTL_MS } from '@/auth/policy'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import { newInvitationToken } from '@/modules/invitations/invitation-token'
import { type DbOrTx, db, pool } from './client'
import {
  accounts,
  entities,
  invitations,
  memberEntityLimits,
  members,
  organizations,
  passwordHistories,
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

async function upsertOrganization(tx: DbOrTx): Promise<string> {
  const [existing] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, ORGANIZATION))
  if (existing) return existing.id
  const [created] = await tx
    .insert(organizations)
    .values({ name: ORGANIZATION, headOfficeState: 'Lagos', financialYearStartMonth: 1 })
    .returning({ id: organizations.id })
  if (!created) throw new Error('Organization insert failed')
  return created.id
}

async function upsertEntities(tx: DbOrTx, organizationId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const e of ENTITIES) {
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

async function upsertPerson(tx: DbOrTx, person: Person, passwordHash: string): Promise<string> {
  const [user] = await tx
    .insert(users)
    .values({
      name: person.name,
      email: person.email,
      emailVerified: true,
      companyName: ORGANIZATION,
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
  const problem = checkPasswordPolicy(password)
  if (problem) throw new Error(`SEED_PASSWORD doesn't meet the password rules (${problem})`)
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

  logger.info('Seeded Vento Homes Ltd', { people: PEOPLE.length, entities: ENTITIES.length })
  process.stdout.write(
    `\nSign in as any of: ${PEOPLE.map((p) => p.email).join(', ')}\n(password: SEED_PASSWORD from .env)\n\nInvitation links:\n  ${links.join('\n  ')}\n\n`,
  )
}

try {
  await seed()
} catch (error) {
  logger.error('Seed failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
} finally {
  await pool.end()
}
