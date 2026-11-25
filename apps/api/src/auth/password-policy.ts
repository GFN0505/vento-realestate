import {
  PASSWORD_RULE_ERROR_CODES,
  type PasswordErrorCode,
  unmetPasswordRules,
} from '@vento/shared'

/**
 * The first rule a password misses (in display order), or null. Reuse of a recent password is
 * checked separately, since it needs the account's history.
 */
export function checkPasswordPolicy(password: string): PasswordErrorCode | null {
  const [first] = unmetPasswordRules(password)
  return first ? PASSWORD_RULE_ERROR_CODES[first] : null
}
