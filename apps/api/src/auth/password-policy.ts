import { createHash } from 'node:crypto'
import { AUTH_ERROR_CODES, PASSWORD_MIN_LENGTH, type PasswordErrorCode } from '@vento/shared'
import { logger } from '@/lib/logger'
import { COMMON_PASSWORD_WORDS } from './common-passwords'

export type BreachCheck = (password: string) => Promise<boolean | 'unknown'>

const HIBP_TIMEOUT_MS = 2_000

/**
 * Have I Been Pwned, k-anonymity: only the first 5 hex characters of the SHA-1 leave Vento.
 * Fails open: if the service is slow or down we answer 'unknown' and sign-up continues with
 * the local rules (spec, "Breached-password check").
 */
export const checkPwnedPasswords: BreachCheck = async (password) => {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding hides how many real matches the prefix has.
      headers: { 'Add-Padding': 'true', 'User-Agent': 'vento-password-check' },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.text()
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':')
      return candidate === suffix && Number(count) > 0
    })
  } catch (error) {
    logger.warn('Breached-password check unavailable; continuing without it', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 'unknown'
  }
}

/** The password with case, and leading or trailing digits and symbols, taken away. */
export function baseWord(password: string): string {
  return password.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '')
}

export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase()
  const core = baseWord(password)
  // "123456789012" or "aaaaaaaaaaa1": nothing memorable beyond digits or repeats.
  if (core.length < 4 || new Set(lower).size < 4) return true
  return COMMON_PASSWORD_WORDS.has(lower) || COMMON_PASSWORD_WORDS.has(core)
}

/** Local rules first (cheap, and they never call out), then the breach check. */
export async function checkPasswordPolicy(
  password: string,
  breachCheck: BreachCheck | null,
): Promise<PasswordErrorCode | null> {
  if (password.length < PASSWORD_MIN_LENGTH) return AUTH_ERROR_CODES.PASSWORD_TOO_SHORT
  if (!/\d/.test(password)) return AUTH_ERROR_CODES.PASSWORD_NEEDS_NUMBER
  if (isCommonPassword(password)) return AUTH_ERROR_CODES.PASSWORD_TOO_COMMON
  if (breachCheck && (await breachCheck(password)) === true)
    return AUTH_ERROR_CODES.PASSWORD_BREACHED
  return null
}
