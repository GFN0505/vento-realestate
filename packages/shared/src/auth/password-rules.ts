// No zod here: auth screens import these helpers without pulling in schemas.

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128
/** A new password can't match any of this many previous ones. */
export const PASSWORD_HISTORY_SIZE = 5

/**
 * Version of the terms and privacy notice shown on sign-up. Bump it when either changes;
 * the accepted version and time are stored on the user.
 */
export const CURRENT_TERMS_VERSION = '2026-11-25'

/** Rules the browser can tick as you type. The common/breached and reuse rules need the server. */
export type LocalPasswordChecks = { length: boolean; number: boolean }

export function checkPasswordLocally(password: string): LocalPasswordChecks {
  return { length: password.length >= PASSWORD_MIN_LENGTH, number: /\d/.test(password) }
}

/** Rule labels, in display order. `reuse` only shows on reset and change. */
export const PASSWORD_RULE_LABELS = {
  length: 'At least 12 characters',
  number: 'Includes a number',
  notCommon: 'Not a common or leaked password',
  reuse: 'Different from your last 5 passwords',
} as const
