import { fallbackORPCErrorMessage, ORPCError } from '@orpc/client'
import type { ConfirmInput } from '@vento/shared/console'
import { COPY, formatLockTime } from '@/lib/auth-errors'
import { GENERIC_ERROR, NETWORK_ERROR } from '@/lib/error-copy'
import { errorReason, isNetworkFailure } from '@/lib/error-data'

export const PASSKEY_FAILED = "That passkey didn't work. Try again, or use a code instead."
export const PASSKEY_UNAVAILABLE = "Passkeys aren't available right now. Use a code instead."

/** Five wrong codes lock sign-in for 15 minutes; the per-minute rate limit is shorter. */
const LOCK_AFTER_SECONDS = 120

/** The error map's default line for BAD_REQUEST: not worth showing over our own copy. */
const DEFAULT_BAD_REQUEST = 'Check the highlighted fields'

/**
 * The server's own sentence, when it sent one ("These backup codes were made with only your
 * password…"): it knows why better than we do. Plain words by contract (errorMap).
 */
function ownMessage(error: ORPCError<string, unknown>): string | null {
  const message = error.message.trim()
  const generic = [DEFAULT_BAD_REQUEST, fallbackORPCErrorMessage(error.code, undefined)]
  return message && !generic.includes(message) ? message : null
}

export type ConfirmFailure = {
  message: string
  /** Shown under the code field (and the field is cleared) rather than above the form. */
  onField: boolean
  /** Sign-in is locked and every session ended: back to sign-in. */
  locked: boolean
}

/** What a refused "Confirm it's you" says (spec UI copy; 2a lock copy reused). */
export function confirmFailure(
  error: unknown,
  method: ConfirmInput['method'],
  now: number = Date.now(),
): ConfirmFailure {
  if (isNetworkFailure(error)) return { message: NETWORK_ERROR, onField: false, locked: false }
  if (!(error instanceof ORPCError)) {
    return { message: GENERIC_ERROR, onField: false, locked: false }
  }
  if (error.code === 'BAD_REQUEST' && errorReason(error) === 'wrong_code') {
    const fallback = method === 'backup_code' ? COPY.wrongBackupCode : COPY.wrongCode
    return { message: ownMessage(error) ?? fallback, onField: true, locked: false }
  }
  if (error.code === 'BAD_REQUEST' && errorReason(error) === 'passkey_failed') {
    return { message: ownMessage(error) ?? PASSKEY_FAILED, onField: false, locked: false }
  }
  if (error.code === 'NOT_FOUND' && method === 'passkey') {
    return { message: PASSKEY_UNAVAILABLE, onField: false, locked: false }
  }
  if (error.code === 'TOO_MANY_REQUESTS') {
    const data: unknown = error.data
    const seconds =
      typeof data === 'object' && data !== null && 'retryAfterSeconds' in data
        ? Number(data.retryAfterSeconds)
        : 0
    if (seconds > LOCK_AFTER_SECONDS) {
      const time = formatLockTime(new Date(now + seconds * 1000).toISOString())
      return { message: time ? COPY.lockedCodes(time) : COPY.locked, onField: false, locked: true }
    }
    return { message: COPY.tooManyRequests, onField: false, locked: false }
  }
  return { message: GENERIC_ERROR, onField: false, locked: false }
}
