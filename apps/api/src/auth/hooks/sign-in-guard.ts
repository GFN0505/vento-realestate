import { AUTH_ERROR_CODES } from '@vento/shared'
import type { APIError } from 'better-auth/api'
import { signInLockedAlert } from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { PASSWORD_LOCK_THRESHOLD, PASSWORD_LOCK_WINDOW_MS, SIGN_IN_LOCK_MS } from '../policy'
import {
  activeLockUntil,
  addAttempt,
  addLock,
  clearAttempts,
  countAttempts,
  findUserByEmail,
  type IdentityUser,
} from '../security-store'
import { type AuthDeps, authError, errorResponse, sendEmail, webUrl } from './deps'

const ATTEMPT_ACTOR = { userId: null, name: 'Sign-in attempt' }

function lockedBody(lockedUntil: Date) {
  return {
    code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
    message: `Sign-in is locked until ${formatTime(lockedUntil)}. We've emailed you.`,
    lockedUntil: lockedUntil.toISOString(),
  }
}

/** For before-hooks: thrown before the endpoint runs, so its 429 status stands. */
export function lockedError(lockedUntil: Date): APIError {
  const { code, message, ...extra } = lockedBody(lockedUntil)
  return authError('TOO_MANY_REQUESTS', code, message, extra)
}

/** For after-hooks: `429 { code: 'ACCOUNT_LOCKED', message, lockedUntil }`. */
export function lockedResponse(lockedUntil: Date): Response {
  return errorResponse(429, lockedBody(lockedUntil))
}

/** A locked account refuses even the right password, for known and unknown emails alike. */
export async function assertNotLocked(deps: AuthDeps, email: string): Promise<void> {
  const until = await activeLockUntil(deps.db, email.toLowerCase())
  if (until) throw lockedError(until)
}

/**
 * Locks sign-in for an email, records it for each organization the person belongs to and
 * sends the security alert. Unknown emails are locked too, so a lock reveals nothing.
 */
export async function lockAccount(
  deps: AuthDeps,
  input: { email: string; reason: 'password' | 'two_step'; lockedUntil?: Date },
): Promise<Date> {
  const now = new Date()
  const lockedUntil = input.lockedUntil ?? new Date(now.getTime() + SIGN_IN_LOCK_MS)
  const user = await findUserByEmail(deps.db, input.email)
  await addLock(deps.db, {
    email: input.email,
    userId: user?.id ?? null,
    reason: input.reason,
    lockedUntil,
  })
  // The count starts again once the lock ends.
  await clearAttempts(deps.db, 'password_failure', input.email)
  if (user) {
    await recordAccountEvent(deps.db, {
      userId: user.id,
      action: 'auth.locked_out',
      actor: ATTEMPT_ACTOR,
      metadata: { reason: input.reason, lockedUntil: lockedUntil.toISOString() },
    })
    await sendEmail(
      deps,
      user.email,
      'security_alert',
      signInLockedAlert({
        reason: input.reason,
        at: formatTime(now),
        on: formatDate(now),
        lockedUntil: formatTime(lockedUntil),
        resetUrl: webUrl('/forgot-password'),
      }),
    )
  }
  return lockedUntil
}

/** After a wrong email or password. Returns the lock end when this failure caused a lock. */
export async function onPasswordFailure(deps: AuthDeps, rawEmail: string): Promise<Date | null> {
  const email = rawEmail.toLowerCase()
  await addAttempt(deps.db, 'password_failure', email)
  const { count } = await countAttempts(deps.db, 'password_failure', email, PASSWORD_LOCK_WINDOW_MS)
  if (count >= PASSWORD_LOCK_THRESHOLD) return lockAccount(deps, { email, reason: 'password' })
  const user = await findUserByEmail(deps.db, email)
  if (user) {
    await recordAccountEvent(deps.db, {
      userId: user.id,
      action: 'auth.sign_in_failed',
      actor: ATTEMPT_ACTOR,
      metadata: { attempt: count },
    })
  }
  return null
}

/** A correct password. With two-step on, "signed in" is recorded after the code instead. */
export async function onPasswordSuccess(deps: AuthDeps, user: IdentityUser): Promise<void> {
  await clearAttempts(deps.db, 'password_failure', user.email)
  if (!user.twoFactorEnabled) {
    await recordAccountEvent(deps.db, {
      userId: user.id,
      action: 'auth.signed_in',
      actor: { userId: user.id, name: user.name },
      metadata: { method: 'password' },
    })
  }
}
