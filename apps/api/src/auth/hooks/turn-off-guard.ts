import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, twoStepRefusal } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { accounts } from '@/db/schema'
import {
  clearWrongCodes,
  isWrongCode,
  onWrongCode,
  twoStepLockedUntil,
  verifyCodeInPlace,
} from '../second-factor'
import { firstTwoStepRequirement, type IdentityUser } from '../security-store'
import { type AuthDeps, authError } from './deps'
import { lockedError, onPasswordFailure } from './sign-in-guard'

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
    // Being a Vento super-admin is a platform role: same code; the message and `requiredBy` say which.
    requirement.reason === 'role' || requirement.reason === 'super_admin'
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
  const locked = await twoStepLockedUntil(deps.db, user.id)
  if (locked) throw lockedError(locked)

  const failure = await verifyCodeInPlace(
    deps.api(),
    input.headers,
    code ? { code } : { backupCode: backupCode ?? '' },
  )
  if (!failure) {
    await clearWrongCodes(deps.db, user.id)
    return
  }
  if (!isWrongCode(failure)) {
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
  // Spec: on the 5th, lock, sign out everywhere, email. This session goes too.
  const lockedUntil = await onWrongCode(deps, user, {
    method: code ? 'totp' : 'backup_code',
    during: 'turn_off',
  })
  if (lockedUntil) throw lockedError(lockedUntil)
  throw authError(
    'BAD_REQUEST',
    failure,
    failure === AUTH_ERROR_CODES.INVALID_CODE
      ? AUTH_ERROR_MESSAGES.INVALID_CODE
      : "That backup code didn't work. Each code works once.",
  )
}
