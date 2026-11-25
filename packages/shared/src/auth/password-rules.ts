// No zod here: auth screens import these helpers without pulling in schemas.

export const MIN_PASSWORD_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
/** A new password can't match any of this many previous ones. */
export const PASSWORD_HISTORY_SIZE = 5

/**
 * Version of the terms and privacy notice shown on sign-up. Bump it when either changes;
 * the accepted version and time are stored on the user.
 */
export const CURRENT_TERMS_VERSION = '2026-11-25'

/** Rules the browser can tick as you type, in display order. The reuse rule needs the server. */
export const PASSWORD_RULE_KEYS = ['length', 'uppercase', 'lowercase', 'number', 'special'] as const
export type PasswordRuleKey = (typeof PASSWORD_RULE_KEYS)[number]

/** `true` means the rule is met. */
export type LocalPasswordChecks = Record<PasswordRuleKey, boolean>

// Unicode classes so a password in any script (é, Ä, Ọ) counts its letters and digits.
const UPPERCASE = /\p{Lu}/u
const LOWERCASE = /\p{Ll}/u
const DIGIT = /\p{Nd}/u
// Anything that isn't a letter, number or whitespace. A space is allowed but doesn't count.
// Accent marks (\p{M}, e.g. the tones in Yoruba names) belong to letters, so they aren't "special".
const SPECIAL = /[^\p{L}\p{M}\p{N}\s]/u

/** Counts code points, not UTF-16 units, so an emoji is one character. */
function characterCount(password: string): number {
  return [...password].length
}

export function checkPasswordLocally(password: string): LocalPasswordChecks {
  return {
    length: characterCount(password) >= MIN_PASSWORD_LENGTH,
    uppercase: UPPERCASE.test(password),
    lowercase: LOWERCASE.test(password),
    number: DIGIT.test(password),
    special: SPECIAL.test(password),
  }
}

/** The rules a password misses, in display order. Empty when all are met. */
export function unmetPasswordRules(password: string): PasswordRuleKey[] {
  const checks = checkPasswordLocally(password)
  return PASSWORD_RULE_KEYS.filter((key) => !checks[key])
}

/** Rule labels, in display order. `reuse` only shows on reset and change. */
export const PASSWORD_RULE_LABELS = {
  length: 'At least 8 characters',
  uppercase: 'An uppercase letter',
  lowercase: 'A lowercase letter',
  number: 'A number',
  special: 'A special character, like ! @ # ?',
  reuse: 'Different from your last 5 passwords',
} as const satisfies Record<PasswordRuleKey | 'reuse', string>
