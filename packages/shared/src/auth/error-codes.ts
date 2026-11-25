/**
 * Error codes returned by `/api/auth/*` (Better Auth's own and ours), as `{ code, message }`
 * in the JSON body. The web maps them to copy; never match on `message`.
 */
export const AUTH_ERROR_CODES = {
  // Ours: password rules (sign-up, reset, change, accept invitation).
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  PASSWORD_NEEDS_NUMBER: 'PASSWORD_NEEDS_NUMBER',
  PASSWORD_TOO_COMMON: 'PASSWORD_TOO_COMMON',
  PASSWORD_BREACHED: 'PASSWORD_BREACHED',
  PASSWORD_REUSED: 'PASSWORD_REUSED',
  TERMS_NOT_ACCEPTED: 'TERMS_NOT_ACCEPTED',
  /** 429. Body also has `lockedUntil` (ISO date-time). */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** 429. Body also has `retryAfterSeconds`. */
  VERIFICATION_RESEND_LIMITED: 'VERIFICATION_RESEND_LIMITED',
  /** 403 on /two-factor/disable when a role requires two-step. */
  TWO_STEP_REQUIRED_BY_ROLE: 'TWO_STEP_REQUIRED_BY_ROLE',
  // Better Auth's, listed so the web can map them.
  INVALID_EMAIL_OR_PASSWORD: 'INVALID_EMAIL_OR_PASSWORD',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CODE: 'INVALID_CODE',
  INVALID_BACKUP_CODE: 'INVALID_BACKUP_CODE',
  INVALID_TWO_FACTOR_COOKIE: 'INVALID_TWO_FACTOR_COOKIE',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  OTP_EXPIRED: 'OTP_EXPIRED',
  INVALID_OTP: 'INVALID_OTP',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
} as const
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]

/** Password rule failures, in the order the rules are listed on screen. */
export const PASSWORD_ERROR_CODES = [
  AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
  AUTH_ERROR_CODES.PASSWORD_NEEDS_NUMBER,
  AUTH_ERROR_CODES.PASSWORD_TOO_COMMON,
  AUTH_ERROR_CODES.PASSWORD_BREACHED,
  AUTH_ERROR_CODES.PASSWORD_REUSED,
] as const
export type PasswordErrorCode = (typeof PASSWORD_ERROR_CODES)[number]

/** Copy for the codes we own. Lock and resend messages need a time, so the web builds those. */
export const AUTH_ERROR_MESSAGES: Record<
  | PasswordErrorCode
  | 'TERMS_NOT_ACCEPTED'
  | 'INVALID_EMAIL_OR_PASSWORD'
  | 'INVALID_CODE'
  | 'TWO_STEP_REQUIRED_BY_ROLE',
  string
> = {
  PASSWORD_TOO_SHORT: 'Use at least 12 characters',
  PASSWORD_NEEDS_NUMBER: 'Include a number',
  PASSWORD_TOO_COMMON: 'That password is too common. Choose another.',
  PASSWORD_BREACHED: 'That password has appeared in a data breach. Choose another.',
  PASSWORD_REUSED: 'Choose a password different from your last 5',
  TERMS_NOT_ACCEPTED: 'Agree to the terms and privacy notice to continue',
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  INVALID_CODE: "That code didn't match. Codes change every 30 seconds, so use the newest one.",
  TWO_STEP_REQUIRED_BY_ROLE: 'Your role requires two-step sign-in, so it stays on.',
}
