import { PASSWORD_HISTORY_SIZE, type TwoStepRequirement } from '@vento/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  lt,
  max,
  min,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  authAttempts,
  members,
  organizations,
  passkeys,
  passwordHistories,
  platformAdmins,
  roles,
  signInLocks,
  users,
  verifications,
} from '@/db/schema'
import { AUTH_ATTEMPT_RETENTION_MS } from './policy'

type AttemptKind = (typeof authAttempts.$inferInsert)['kind']

// Small queries behind the Better Auth hooks. They touch identity tables only.

/** Records one attempt and prunes this subject's rows older than a day. */
export async function addAttempt(db: DbOrTx, kind: AttemptKind, subject: string): Promise<void> {
  const cutoff = new Date(Date.now() - AUTH_ATTEMPT_RETENTION_MS)
  await db
    .delete(authAttempts)
    .where(and(eq(authAttempts.subject, subject), lt(authAttempts.createdAt, cutoff)))
  await db.insert(authAttempts).values({ kind, subject })
}

export async function countAttempts(
  db: DbOrTx,
  kind: AttemptKind,
  subject: string,
  sinceMs: number,
): Promise<{ count: number; oldest: Date | null; latest: Date | null }> {
  const [row] = await db
    .select({
      count: count(),
      oldest: min(authAttempts.createdAt),
      latest: max(authAttempts.createdAt),
    })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.kind, kind),
        eq(authAttempts.subject, subject),
        gt(authAttempts.createdAt, new Date(Date.now() - sinceMs)),
      ),
    )
  return { count: row?.count ?? 0, oldest: row?.oldest ?? null, latest: row?.latest ?? null }
}

export async function clearAttempts(db: DbOrTx, kind: AttemptKind, subject: string): Promise<void> {
  await db
    .delete(authAttempts)
    .where(and(eq(authAttempts.kind, kind), eq(authAttempts.subject, subject)))
}

/** The end of the latest active lock for this email, if any. */
export async function activeLockUntil(db: DbOrTx, email: string): Promise<Date | null> {
  const [row] = await db
    .select({ lockedUntil: signInLocks.lockedUntil })
    .from(signInLocks)
    .where(and(eq(signInLocks.email, email), gt(signInLocks.lockedUntil, new Date())))
    .orderBy(desc(signInLocks.lockedUntil))
    .limit(1)
  return row?.lockedUntil ?? null
}

export async function addLock(
  db: DbOrTx,
  lock: {
    email: string
    userId: string | null
    reason: 'password' | 'two_step'
    lockedUntil: Date
  },
): Promise<void> {
  await db.insert(signInLocks).values(lock)
}

export type IdentityUser = {
  id: string
  name: string
  email: string
  twoFactorEnabled: boolean
  passwordResetRequired: boolean
}

const identityColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  twoFactorEnabled: users.twoFactorEnabled,
  passwordResetRequired: users.passwordResetRequired,
}

export async function findUserByEmail(db: DbOrTx, email: string): Promise<IdentityUser | null> {
  const [row] = await db
    .select(identityColumns)
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
  return row ?? null
}

export async function findUserById(db: DbOrTx, id: string): Promise<IdentityUser | null> {
  const [row] = await db.select(identityColumns).from(users).where(eq(users.id, id))
  return row ?? null
}

/** Stores a password hash and keeps only the newest few. */
export async function rememberPasswordHash(
  db: DbOrTx,
  userId: string,
  hash: string,
): Promise<void> {
  await db.insert(passwordHistories).values({ userId, passwordHash: hash })
  const keep = db
    .select({ id: passwordHistories.id })
    .from(passwordHistories)
    .where(eq(passwordHistories.userId, userId))
    .orderBy(desc(passwordHistories.createdAt), desc(passwordHistories.id))
    .limit(PASSWORD_HISTORY_SIZE)
  await db
    .delete(passwordHistories)
    .where(and(eq(passwordHistories.userId, userId), notInArray(passwordHistories.id, keep)))
}

/** Copies the current credential hash into the history (after a reset or change). */
export async function rememberCurrentPassword(db: DbOrTx, userId: string): Promise<void> {
  const [account] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
  if (account?.password) await rememberPasswordHash(db, userId, account.password)
}

export async function recentPasswordHashes(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ hash: passwordHistories.passwordHash })
    .from(passwordHistories)
    .where(eq(passwordHistories.userId, userId))
    .orderBy(desc(passwordHistories.createdAt))
    .limit(PASSWORD_HISTORY_SIZE)
  return rows.map((r) => r.hash)
}

/**
 * The first active membership that requires two-step, by role or by the organization's
 * "Require two-step for everyone": the preferred (active) organization first, then by name.
 * A role requirement is named before the organization's when both apply; being a Vento
 * super-admin comes before both. Null when none does.
 */
export async function firstTwoStepRequirement(
  db: DbOrTx,
  userId: string,
  preferOrganizationId: string | null = null,
): Promise<TwoStepRequirement | null> {
  // A Vento super-admin can't turn two-step off: the console needs it (decision 0021).
  const [admin] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
  if (admin) return { reason: 'super_admin', organizationName: 'Vento', roleName: null }
  const [row] = await db
    .select({
      organizationName: organizations.name,
      byRole: roles.requiresTwoStep,
      roleName: roles.name,
    })
    .from(members)
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(
      and(
        eq(members.userId, userId),
        eq(members.status, 'active'),
        or(eq(roles.requiresTwoStep, true), eq(organizations.twoStepRequiredForEveryone, true)),
      ),
    )
    .orderBy(
      sql`(${members.organizationId} = ${preferOrganizationId}::uuid) is true desc`,
      asc(organizations.name),
      asc(organizations.id),
    )
    .limit(1)
  if (!row) return null
  return row.byRole
    ? { reason: 'role', organizationName: row.organizationName, roleName: row.roleName }
    : { reason: 'organization', organizationName: row.organizationName, roleName: null }
}

/** How many passkeys the person has (every organization: they belong to the person). */
export async function passkeyCountFor(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId))
  return row?.n ?? 0
}

export async function clearTwoStepSetupRequired(db: DbOrTx, userId: string): Promise<void> {
  await db.update(users).set({ twoStepSetupRequired: false }).where(eq(users.id, userId))
}

/**
 * The person a password-reset token belongs to (Better Auth stores it as `reset-password:<token>`
 * with the user id as text). Null when unknown, used or expired.
 */
export async function userIdForResetToken(db: DbOrTx, token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !token) return null
  const [row] = await db
    .select({ value: verifications.value })
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, `reset-password:${token}`),
        gt(verifications.expiresAt, new Date()),
      ),
    )
  const userId = row?.value
  return userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null
}

export async function clearPasswordResetRequired(db: DbOrTx, userId: string): Promise<void> {
  await db.update(users).set({ passwordResetRequired: false }).where(eq(users.id, userId))
}
