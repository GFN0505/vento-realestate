import { AUTH_ERROR_MESSAGES, AUTH_ERROR_CODES as C, type PasswordErrorCode } from '@vento/shared'
import type { ServerPasswordIssues } from '@/components/auth/password-rules'

/**
 * Turns Better Auth errors into the spec's copy (docs/specs/accounts-and-access.md, UI copy).
 * People never see Better Auth's own messages or codes.
 */

/** The shape the Better Auth client returns in `{ error }`. Extra body fields ride along. */
export type AuthClientError = {
  code?: string | undefined
  message?: string | undefined
  status: number
  lockedUntil?: string | undefined
  retryAfterSeconds?: number | undefined
}

const timeInLagos = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
})

/** "10:45" in West Africa Time, which is what every Vento user reads. */
export function formatLockTime(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : timeInLagos.format(date)
}

export const NETWORK_ERROR =
  "Couldn't reach Vento. Check your connection and try again. What you typed is still here."
export const GENERIC_ERROR = 'Something went wrong on our side. Try again in a moment.'

export const COPY = {
  wrongPassword: AUTH_ERROR_MESSAGES.INVALID_EMAIL_OR_PASSWORD,
  wrongCode: AUTH_ERROR_MESSAGES.INVALID_CODE,
  wrongBackupCode: "That backup code didn't match, or it has been used already.",
  wrongEmailCode: "That code didn't match. Check the newest email from Vento.",
  emailCodeExpired: 'That code has expired. Send a new one.',
  twoStepTimedOut: 'That took too long. Sign in again to get a new two-step check.',
  tooManyRequests: 'Too many tries. Wait a minute and try again.',
  linkExpired: 'This link has expired.',
  lockedCodes: (time: string) =>
    `Too many wrong codes. Sign-in is locked until ${time}. We've emailed you.`,
  lockedPasswords: (time: string) =>
    `Too many wrong passwords. Sign-in is locked until ${time}. We've emailed you.`,
  locked: "Too many wrong tries. Sign-in is locked for 15 minutes. We've emailed you.",
  emailNotVerified: 'Verify your email first. We sent you a new link.',
} as const

export function isNetworkError(error: AuthClientError): boolean {
  return !error.status
}

export function isLocked(error: AuthClientError): boolean {
  return error.code === C.ACCOUNT_LOCKED || error.code === 'ACCOUNT_TEMPORARILY_LOCKED'
}

const PASSWORD_CODES: readonly string[] = [
  C.PASSWORD_TOO_SHORT,
  C.PASSWORD_NEEDS_NUMBER,
  C.PASSWORD_TOO_COMMON,
  C.PASSWORD_BREACHED,
  C.PASSWORD_REUSED,
]

function isPasswordCode(code: string | undefined): code is PasswordErrorCode {
  return code !== undefined && PASSWORD_CODES.includes(code)
}

/** Which server-only password rules failed, for PasswordRules to show in rose. */
export function passwordIssues(error: AuthClientError | null): ServerPasswordIssues {
  if (!error) return {}
  return {
    common: error.code === C.PASSWORD_TOO_COMMON || error.code === C.PASSWORD_BREACHED,
    reused: error.code === C.PASSWORD_REUSED,
  }
}

type Step = 'sign-in' | 'two-step' | 'backup-code' | 'email-code' | 'general'

export function authErrorMessage(error: AuthClientError, step: Step = 'general'): string {
  if (isNetworkError(error)) return NETWORK_ERROR
  if (isLocked(error)) {
    const time = formatLockTime(error.lockedUntil)
    if (!time) return COPY.locked
    return step === 'sign-in' ? COPY.lockedPasswords(time) : COPY.lockedCodes(time)
  }
  if (isPasswordCode(error.code)) return AUTH_ERROR_MESSAGES[error.code]
  switch (error.code) {
    case C.INVALID_EMAIL_OR_PASSWORD:
    case C.INVALID_PASSWORD:
      return COPY.wrongPassword
    case C.INVALID_CODE:
      return COPY.wrongCode
    case C.INVALID_BACKUP_CODE:
      return COPY.wrongBackupCode
    case C.INVALID_OTP:
      return COPY.wrongEmailCode
    case C.OTP_EXPIRED:
    case C.TOO_MANY_ATTEMPTS:
    case C.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
      return COPY.emailCodeExpired
    case C.INVALID_TWO_FACTOR_COOKIE:
      return COPY.twoStepTimedOut
    case C.INVALID_TOKEN:
      return COPY.linkExpired
    case C.EMAIL_NOT_VERIFIED:
      return COPY.emailNotVerified
    case C.PASSWORD_RESET_REQUIRED:
      return AUTH_ERROR_MESSAGES.PASSWORD_RESET_REQUIRED
    case C.TERMS_NOT_ACCEPTED:
      return AUTH_ERROR_MESSAGES.TERMS_NOT_ACCEPTED
    case C.VERIFICATION_RESEND_LIMITED:
      return COPY.tooManyRequests
  }
  if (error.status === 429) return COPY.tooManyRequests
  if (error.status === 401 && step === 'sign-in') return COPY.wrongPassword
  return GENERIC_ERROR
}

/** Seconds to wait before resending, when the server sent one with a 429. */
export function retryAfterSeconds(error: object): number | null {
  return 'retryAfterSeconds' in error && typeof error.retryAfterSeconds === 'number'
    ? error.retryAfterSeconds
    : null
}

/**
 * A sign-in failure the screen can act on: wrong password and lockout carry a reset link,
 * lockout and rate limits carry the moment the person can try again.
 */
export type AuthFailure = {
  kind: 'wrong-password' | 'locked' | 'rate-limited' | 'other'
  message: string
  /** Epoch ms when trying again makes sense, or null. */
  until: number | null
  /** What was wrong too often: drives "Too many wrong passwords / codes". */
  lockedBy: 'passwords' | 'codes'
}

const LOCK_FALLBACK_MS = 15 * 60_000
const RATE_FALLBACK_MS = 60_000

export function toAuthFailure(
  error: AuthClientError,
  step: Step,
  retryAfter: number | null = null,
): AuthFailure {
  const lockedBy = step === 'sign-in' ? 'passwords' : 'codes'
  const message = authErrorMessage(error, step)
  if (isLocked(error)) {
    const parsed = error.lockedUntil ? Date.parse(error.lockedUntil) : Number.NaN
    const until = Number.isNaN(parsed) ? Date.now() + LOCK_FALLBACK_MS : parsed
    return { kind: 'locked', message, until, lockedBy }
  }
  if (error.status === 429) {
    const wait = retryAfter ?? retryAfterSeconds(error)
    return {
      kind: 'rate-limited',
      message: COPY.tooManyRequests,
      until: Date.now() + (wait ? wait * 1000 : RATE_FALLBACK_MS),
      lockedBy,
    }
  }
  if (message === COPY.wrongPassword)
    return { kind: 'wrong-password', message, until: null, lockedBy }
  return { kind: 'other', message, until: null, lockedBy }
}

/** Seconds from an `X-Retry-After` (or `Retry-After`) header, if it holds a number. */
export function retryAfterHeader(headers: Headers): number | null {
  const value = Number(headers.get('X-Retry-After') ?? headers.get('Retry-After'))
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
}
