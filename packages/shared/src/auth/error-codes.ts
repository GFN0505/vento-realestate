import type { PasswordRuleKey } from './password-rules'

/**
 * Error codes returned by `/api/auth/*` (Better Auth's own and ours), as `{ code, message }`
 * in the JSON body. The web maps them to copy; never match on `message`.
 */
export const AUTH_ERROR_CODES = {
  // Ours: password rules (sign-up, reset, change, accept invitation).
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  PASSWORD_NEEDS_UPPERCASE: 'PASSWORD_NEEDS_UPPERCASE',
  PASSWORD_NEEDS_LOWERCASE: 'PASSWORD_NEEDS_LOWERCASE',
  PASSWORD_NEEDS_NUMBER: 'PASSWORD_NEEDS_NUMBER',
  PASSWORD_NEEDS_SPECIAL: 'PASSWORD_NEEDS_SPECIAL',
  PASSWORD_REUSED: 'PASSWORD_REUSED',
  TERMS_NOT_ACCEPTED: 'TERMS_NOT_ACCEPTED',
  /** 429. Body also has `lockedUntil` (ISO date-time). */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** 429. Body also has `retryAfterSeconds`. */
  VERIFICATION_RESEND_LIMITED: 'VERIFICATION_RESEND_LIMITED',
  /** 403 on /sign-in/email after an owner or admin reset two-step: set a new password first. */
  PASSWORD_RESET_REQUIRED: 'PASSWORD_RESET_REQUIRED',
  /**
   * 403 on /two-factor/disable when a role requires two-step. Body also has `requiredBy`
   * (a `TwoStepRequirement`); `message` is `twoStepRefusal(requiredBy)`.
   */
  TWO_STEP_REQUIRED_BY_ROLE: 'TWO_STEP_REQUIRED_BY_ROLE',
  /** 403 on /two-factor/disable when an organization requires two-step for everyone. As above. */
  TWO_STEP_REQUIRED_BY_ORGANIZATION: 'TWO_STEP_REQUIRED_BY_ORGANIZATION',
  /** 400 on /two-factor/disable without a `code` or `backupCode` in the body. */
  CODE_REQUIRED: 'CODE_REQUIRED',
  /**
   * 404 on the passkey endpoints: `platform.passkeys` isn't available (adding: in the active
   * organization; signing in: in any of the person's organizations, or switched off).
   */
  PASSKEYS_UNAVAILABLE: 'PASSKEYS_UNAVAILABLE',
  /** 401 after a passkey sign-in for someone with no active membership. Reveals nothing. */
  PASSKEY_NOT_RECOGNISED: 'PASSKEY_NOT_RECOGNISED',
  /** 409 when adding an 11th passkey. */
  PASSKEY_LIMIT: 'PASSKEY_LIMIT',
  /** 403 on /passkey/generate-register-options: "Confirm it's you" first (account.confirmPassword). */
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
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
  /** Two-step is off now (a stale "Make new codes" from another tab). */
  TWO_FACTOR_NOT_ENABLED: 'TWO_FACTOR_NOT_ENABLED',
  // The passkey plugin's: unknown or removed credential, failed check, missing or used challenge.
  PASSKEY_NOT_FOUND: 'PASSKEY_NOT_FOUND',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
  FAILED_TO_VERIFY_REGISTRATION: 'FAILED_TO_VERIFY_REGISTRATION',
} as const
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]

/** Password rule failures, in the order the rules are listed on screen. */
export const PASSWORD_ERROR_CODES = [
  AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
  AUTH_ERROR_CODES.PASSWORD_NEEDS_UPPERCASE,
  AUTH_ERROR_CODES.PASSWORD_NEEDS_LOWERCASE,
  AUTH_ERROR_CODES.PASSWORD_NEEDS_NUMBER,
  AUTH_ERROR_CODES.PASSWORD_NEEDS_SPECIAL,
  AUTH_ERROR_CODES.PASSWORD_REUSED,
] as const
export type PasswordErrorCode = (typeof PASSWORD_ERROR_CODES)[number]

/** The error code for each locally checked rule, so the API and the zod schema agree. */
export const PASSWORD_RULE_ERROR_CODES = {
  length: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
  uppercase: AUTH_ERROR_CODES.PASSWORD_NEEDS_UPPERCASE,
  lowercase: AUTH_ERROR_CODES.PASSWORD_NEEDS_LOWERCASE,
  number: AUTH_ERROR_CODES.PASSWORD_NEEDS_NUMBER,
  special: AUTH_ERROR_CODES.PASSWORD_NEEDS_SPECIAL,
} as const satisfies Record<PasswordRuleKey, PasswordErrorCode>

/** Copy for the codes we own. Lock and resend messages need a time, so the web builds those. */
export const AUTH_ERROR_MESSAGES: Record<
  | PasswordErrorCode
  | 'TERMS_NOT_ACCEPTED'
  | 'INVALID_EMAIL_OR_PASSWORD'
  | 'INVALID_CODE'
  | 'TWO_STEP_REQUIRED_BY_ROLE'
  | 'PASSWORD_RESET_REQUIRED'
  | 'CODE_REQUIRED'
  | 'PASSKEYS_UNAVAILABLE'
  | 'PASSKEY_NOT_RECOGNISED'
  | 'PASSKEY_NOT_FOUND'
  | 'PASSKEY_LIMIT'
  | 'REAUTH_REQUIRED'
  | 'TWO_FACTOR_NOT_ENABLED',
  string
> = {
  PASSWORD_TOO_SHORT: 'Use at least 8 characters',
  PASSWORD_NEEDS_UPPERCASE: 'Add an uppercase letter',
  PASSWORD_NEEDS_LOWERCASE: 'Add a lowercase letter',
  PASSWORD_NEEDS_NUMBER: 'Add a number',
  PASSWORD_NEEDS_SPECIAL: 'Add a special character, like ! @ # ?',
  PASSWORD_REUSED: 'Choose a password different from your last 5',
  TERMS_NOT_ACCEPTED: 'Agree to the terms and privacy notice to continue',
  INVALID_EMAIL_OR_PASSWORD: 'Invalid email or password',
  INVALID_CODE: "That code didn't match. Codes change every 30 seconds, so use the newest one.",
  TWO_STEP_REQUIRED_BY_ROLE: 'Your role requires two-step sign-in, so it stays on.',
  PASSWORD_RESET_REQUIRED:
    'Your two-step sign-in was reset. Set a new password with the link we emailed you, then sign in.',
  CODE_REQUIRED: 'Enter the code from your authenticator app, or a backup code.',
  PASSKEYS_UNAVAILABLE:
    "Passkeys aren't available for your account yet. Sign in with your password.",
  PASSKEY_NOT_RECOGNISED: "That passkey isn't recognised. Sign in with your password.",
  // Removed and unknown passkeys read the same (plan question 4).
  PASSKEY_NOT_FOUND: "That passkey isn't recognised. Sign in with your password.",
  PASSKEY_LIMIT: 'You can have up to 10 passkeys. Remove one you no longer use.',
  REAUTH_REQUIRED: 'Enter your password to continue.',
  TWO_FACTOR_NOT_ENABLED: 'Two-step is off now. The page is up to date.',
}
