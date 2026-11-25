import { PASSWORD_HISTORY_SIZE } from '@vento/shared'
import { and, count, desc, eq, gt, lt, max, min, notInArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  authAttempts,
  members,
  passwordHistories,
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

/** True when any active membership's role requires two-step. */
export async function roleRequiresTwoStep(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(members)
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.userId, userId),
        eq(members.status, 'active'),
        eq(roles.requiresTwoStep, true),
      ),
    )
  return (row?.n ?? 0) > 0
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
