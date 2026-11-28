import { createHmac, timingSafeEqual } from 'node:crypto'
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES } from '@vento/shared'
import { APIError } from 'better-auth/api'
import { type SymmetricDecryptOptions, symmetricDecrypt } from 'better-auth/crypto'
import { eq, sql } from 'drizzle-orm'
import { proofIsFresh } from '@/access/console-window'
import type { DbOrTx } from '@/db/client'
import { sessions, twoFactors } from '@/db/schema'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { activeSuperAdmin } from '@/platform/super-admins'
import { type AuthServerApi, authError, errorCode, type LockDeps } from './hooks/deps'
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
  const before = scope.auth.twoStepMode
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
  } finally {
    // Only these calls skip our verify hooks; nothing later in the request may.
    scope.auth.twoStepMode = before
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

/**
 * A Vento super-admin can only make a new second factor (backup codes, a passkey) with a code or
 * passkey proven on this session in the last 5 minutes: a password and a live session alone
 * would otherwise mint a way into the console (audit H1). Everyone else is unaffected.
 */
export async function assertFreshFactorForSuperAdmin(
  db: DbOrTx,
  session: { userId: string; secondFactorAt: Date | null },
  now = new Date(),
): Promise<void> {
  if (proofIsFresh(session, now)) return
  if (!(await activeSuperAdmin(db, session.userId))) return
  throw authError(
    'FORBIDDEN',
    AUTH_ERROR_CODES.SECOND_FACTOR_REQUIRED,
    AUTH_ERROR_MESSAGES.SECOND_FACTOR_REQUIRED,
  )
}

// Authenticator code replay (audit L4). Better Auth accepts the code for the current 30-second
// step and one either side, and doesn't remember which it used; we do, and refuse any code for
// that step or an earlier one, so a code seen over someone's shoulder or by a phishing page
// can't be used again.

const TOTP_PERIOD_MS = 30_000
const BASE32_PREFIX = 'base32:'
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Bytes(input: string): Buffer {
  let bits = ''
  for (const c of input.replace(/=+$/, '').toUpperCase()) {
    const i = BASE32.indexOf(c)
    if (i >= 0) bits += i.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', key).update(message).digest()
  const offset = (mac.at(-1) ?? 0) & 0xf
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

/** The plugin's secret as HMAC key bytes (it stores imported base32 secrets with a prefix). */
async function totpKey(key: SymmetricDecryptOptions['key'], encrypted: string): Promise<Buffer> {
  const secret = await symmetricDecrypt({ key, data: encrypted })
  return secret.startsWith(BASE32_PREFIX)
    ? base32Bytes(secret.slice(BASE32_PREFIX.length))
    : Buffer.from(secret, 'utf8')
}

/**
 * The step a code belongs to (now, or one either side, as the plugin allows), or null when it
 * matches none or the secret can't be read; the plugin then gives its own answer.
 */
export async function totpStepOf(
  db: DbOrTx,
  userId: string,
  code: string,
  key: SymmetricDecryptOptions['key'] | undefined,
  now = Date.now(),
): Promise<{ step: number; replayed: boolean } | null> {
  if (key === undefined) return null
  const [row] = await db
    .select({ secret: twoFactors.secret, lastStep: twoFactors.lastTotpStep })
    .from(twoFactors)
    .where(eq(twoFactors.userId, userId))
  if (!row) return null
  let bytes: Buffer
  try {
    bytes = await totpKey(key, row.secret)
  } catch {
    return null
  }
  const current = Math.floor(now / TOTP_PERIOD_MS)
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(hotp(bytes, step))
    const given = Buffer.from(code.padEnd(6).slice(0, 6))
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return { step, replayed: row.lastStep !== null && step <= row.lastStep }
    }
  }
  return null
}

/** Remembers the step of an accepted code; only ever moves forward. */
export async function recordTotpStep(db: DbOrTx, userId: string, step: number): Promise<void> {
  await db
    .update(twoFactors)
    .set({ lastTotpStep: sql`greatest(coalesce(${twoFactors.lastTotpStep}, 0), ${step})` })
    .where(eq(twoFactors.userId, userId))
}
