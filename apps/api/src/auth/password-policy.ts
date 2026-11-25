import { AUTH_ERROR_CODES, PASSWORD_MIN_LENGTH, type PasswordErrorCode } from '@vento/shared'

/**
 * The first rule a password misses, or null. Reuse of a recent password is checked separately,
 * since it needs the account's history.
 */
export function checkPasswordPolicy(password: string): PasswordErrorCode | null {
  if (password.length < PASSWORD_MIN_LENGTH) return AUTH_ERROR_CODES.PASSWORD_TOO_SHORT
  if (!/\d/.test(password)) return AUTH_ERROR_CODES.PASSWORD_NEEDS_NUMBER
  return null
}
