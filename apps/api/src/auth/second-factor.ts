import { AUTH_ERROR_CODES } from '@vento/shared'
import { APIError } from 'better-auth/api'
import { eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { sessions, twoFactors } from '@/db/schema'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { type AuthServerApi, errorCode, type LockDeps } from './hooks/deps'
import { lockAccount } from './hooks/sign-in-guard'
import { SIGN_IN_LOCK_MS, TWO_STEP_LOCK_THRESHOLD } from './policy'

// Checking an authenticator or backup code for someone already signed in, outside the sign-in
// page: turning two-step off and the console's "Confirm it's you". Wrong codes count towards the
// same lock as sign-in (5 in a row), with the same consequences.

export type CodeInput = { code: string } | { backupCode: string }

/** The plugin's own lock column, so the sign-in code step honours a lock made here too. */
export async function twoStepLockedUntil(db: DbOrTx, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lockedUntil: twoFactors.lockedUntil })
    .from(twoFactors)
    .where(eq(twoFactors.userId, userId))
  return row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null
}

/** One wrong code in a row; the 5th locks (atomic, like the plugin's own counter). */
export async function recordWrongCode(db: DbOrTx, userId: string): Promise<Date | null> {
  const lockUntil = new Date(Date.now() + SIGN_IN_LOCK_MS)
  const [row] = await db
    .update(twoFactors)
    .set({
      failedVerificationCount: sql`${twoFactors.failedVerificationCount} + 1`,
      lockedUntil: sql`case when ${twoFactors.failedVerificationCount} + 1 >= ${TWO_STEP_LOCK_THRESHOLD}
        then ${lockUntil.toISOString()}::timestamptz else ${twoFactors.lockedUntil} end`,
    })
    .where(eq(twoFactors.userId, userId))
    .returning({ lockedUntil: twoFactors.lockedUntil })
  return row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null
}

/** A right code ends the run of wrong ones. */
export async function clearWrongCodes(db: DbOrTx, userId: string): Promise<void> {
  await db
    .update(twoFactors)
    .set({ failedVerificationCount: 0, lockedUntil: null })
    .where(eq(twoFactors.userId, userId))
}

/**
 * Checks the code through Better Auth's own verifiers, in-process with the request's headers, so
 * the secret never leaves the plugin. With a live session neither makes a new session; a backup
 * code is consumed, as any use does. `in_place` tells our verify hooks to stay out of it.
 * Returns null when it matched, else the plugin's error code.
 */
export async function verifyCodeInPlace(
  api: Pick<AuthServerApi, 'verifyTOTP' | 'verifyBackupCode'>,
  headers: Headers,
  input: CodeInput,
): Promise<string | null> {
  const scope = requestScope()
  scope.auth.twoStepMode = 'in_place'
  try {
    if ('code' in input) await api.verifyTOTP({ body: { code: input.code }, headers })
    else {
      await api.verifyBackupCode({
        body: { code: input.backupCode, disableSession: true },
        headers,
      })
    }
    return null
  } catch (error) {
    if (error instanceof APIError) return errorCode(error)
    throw error
  }
}

export function isWrongCode(failure: string): boolean {
  return (
    failure === AUTH_ERROR_CODES.INVALID_CODE || failure === AUTH_ERROR_CODES.INVALID_BACKUP_CODE
  )
}

/**
 * A wrong code while signed in: audits it, counts it, and on the 5th locks sign-in, signs the
 * person out everywhere (this session too) and emails them. Returns the lock's end, if locked.
 */
export async function onWrongCode(
  deps: LockDeps,
  user: { id: string; name: string; email: string },
  input: { method: 'totp' | 'backup_code'; during: 'turn_off' | 'console' },
): Promise<Date | null> {
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'auth.two_step_failed',
    actor: { userId: user.id, name: user.name },
    metadata: { method: input.method, during: input.during },
  })
  const lockedUntil = await recordWrongCode(deps.db, user.id)
  if (!lockedUntil) return null
  await lockAccount(deps, { email: user.email, reason: 'two_step', lockedUntil })
  await deps.db.delete(sessions).where(eq(sessions.userId, user.id))
  return lockedUntil
}
