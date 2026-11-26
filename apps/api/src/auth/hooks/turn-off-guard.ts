import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, twoStepRefusal } from '@vento/shared'
import { APIError } from 'better-auth/api'
import { and, eq, sql } from 'drizzle-orm'
import { accounts, sessions, twoFactors } from '@/db/schema'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { SIGN_IN_LOCK_MS, TWO_STEP_LOCK_THRESHOLD } from '../policy'
import { firstTwoStepRequirement, type IdentityUser } from '../security-store'
import { type AuthDeps, authError, errorCode } from './deps'
import { lockAccount, lockedError, onPasswordFailure } from './sign-in-guard'

// Turning two-step off needs the password and a current code or a backup code (2a decision 11,
// built with My security). The plugin only checks the password, so this before-hook does the rest.

type Verify = (data: { hash: string; password: string }) => Promise<boolean>

function text(body: unknown, key: string): string | null {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Refused while any active membership requires two-step; the message names the first one. */
export async function assertTwoStepNotRequired(deps: AuthDeps, userId: string): Promise<void> {
  const requirement = await firstTwoStepRequirement(deps.db, userId)
  if (!requirement) return
  throw authError(
    'FORBIDDEN',
    requirement.reason === 'role'
      ? AUTH_ERROR_CODES.TWO_STEP_REQUIRED_BY_ROLE
      : AUTH_ERROR_CODES.TWO_STEP_REQUIRED_BY_ORGANIZATION,
    twoStepRefusal(requirement),
    { requiredBy: requirement },
  )
}

async function credentialHash(deps: AuthDeps, userId: string): Promise<string | null> {
  const [row] = await deps.db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
  return row?.password ?? null
}

/**
 * A wrong password counts towards the 10-in-15-minutes lock; checked before the code so a wrong
 * password never spends a backup code.
 */
export async function assertPassword(
  deps: AuthDeps,
  user: IdentityUser,
  password: string | null,
  verify: Verify,
): Promise<void> {
  const hash = await credentialHash(deps, user.id)
  if (password && hash && (await verify({ hash, password }))) return
  const lockedUntil = await onPasswordFailure(deps, user.email)
  if (lockedUntil) throw lockedError(lockedUntil)
  throw authError('BAD_REQUEST', AUTH_ERROR_CODES.INVALID_PASSWORD, 'Invalid password')
}

/** The plugin's own lock column, so the sign-in code step honours a lock made here too. */
async function twoStepLockedUntil(deps: AuthDeps, userId: string): Promise<Date | null> {
  const [row] = await deps.db
    .select({ lockedUntil: twoFactors.lockedUntil })
    .from(twoFactors)
    .where(eq(twoFactors.userId, userId))
  return row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null
}

/** One wrong code in a row; the 5th locks (atomic, like the plugin's own counter). */
async function recordWrongCode(deps: AuthDeps, userId: string): Promise<Date | null> {
  const lockUntil = new Date(Date.now() + SIGN_IN_LOCK_MS)
  const [row] = await deps.db
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

/**
 * Checks the code through Better Auth's own verifiers, in-process with the request's headers, so
 * the secret never leaves the plugin. With a live session neither makes a new session; a backup
 * code is consumed, as any use does. `turn_off` tells our verify hooks to stay out of it.
 */
async function verifyCode(
  deps: AuthDeps,
  headers: Headers,
  input: { code: string } | { backupCode: string },
): Promise<string | null> {
  const scope = requestScope()
  scope.auth.twoStepMode = 'turn_off'
  try {
    if ('code' in input) await deps.api().verifyTOTP({ body: { code: input.code }, headers })
    else {
      await deps
        .api()
        .verifyBackupCode({ body: { code: input.backupCode, disableSession: true }, headers })
    }
    return null
  } catch (error) {
    if (error instanceof APIError) return errorCode(error)
    throw error
  }
}

/** Everything /two-factor/disable needs beyond the plugin's password check. */
export async function guardTurnOff(
  deps: AuthDeps,
  input: { user: IdentityUser; body: unknown; headers: Headers; verify: Verify },
): Promise<void> {
  const { user } = input
  await assertTwoStepNotRequired(deps, user.id)
  const code = text(input.body, 'code')
  const backupCode = text(input.body, 'backupCode')
  if (!code && !backupCode) {
    throw authError(
      'BAD_REQUEST',
      AUTH_ERROR_CODES.CODE_REQUIRED,
      AUTH_ERROR_MESSAGES.CODE_REQUIRED,
    )
  }
  await assertPassword(deps, user, text(input.body, 'password'), input.verify)
  const locked = await twoStepLockedUntil(deps, user.id)
  if (locked) throw lockedError(locked)

  const failure = await verifyCode(
    deps,
    input.headers,
    code ? { code } : { backupCode: backupCode ?? '' },
  )
  if (!failure) {
    await deps.db
      .update(twoFactors)
      .set({ failedVerificationCount: 0, lockedUntil: null })
      .where(eq(twoFactors.userId, user.id))
    return
  }
  const wrong =
    failure === AUTH_ERROR_CODES.INVALID_CODE || failure === AUTH_ERROR_CODES.INVALID_BACKUP_CODE
  if (!wrong) {
    // Two-step was turned off meanwhile (another tab): the page is stale. Anything else is the
    // plugin's own answer, passed on as it is.
    const off = failure === 'TOTP_NOT_ENABLED' || failure === 'BACKUP_CODES_NOT_ENABLED'
    throw off
      ? authError(
          'BAD_REQUEST',
          AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
          AUTH_ERROR_MESSAGES.TWO_FACTOR_NOT_ENABLED,
        )
      : authError('BAD_REQUEST', failure, 'Something went wrong. Try again.')
  }
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'auth.two_step_failed',
    actor: { userId: user.id, name: user.name },
    metadata: { method: code ? 'totp' : 'backup_code', during: 'turn_off' },
  })
  const lockedUntil = await recordWrongCode(deps, user.id)
  if (lockedUntil) {
    // Spec: lock, sign out everywhere, email. This session goes too.
    await lockAccount(deps, { email: user.email, reason: 'two_step', lockedUntil })
    await deps.db.delete(sessions).where(eq(sessions.userId, user.id))
    throw lockedError(lockedUntil)
  }
  throw authError(
    'BAD_REQUEST',
    failure,
    failure === AUTH_ERROR_CODES.INVALID_CODE
      ? AUTH_ERROR_MESSAGES.INVALID_CODE
      : "That backup code didn't work. Each code works once.",
  )
}
