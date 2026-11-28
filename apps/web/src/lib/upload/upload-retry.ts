import { ORPCError } from '@orpc/client'
import { errorReason } from '@/lib/error-data'

/*
 * Waiting and retrying for uploads: the clock and network seams tests replace, which failures are
 * worth another try, and how long to wait between them.
 */

/** `connection` from `@/lib/connection` fits; the default reads the browser's own flag. */
export type UploadNetwork = {
  isOnline(): boolean
  subscribe(listener: () => void): () => void
  reportNetworkFailure?(): void
}
export type UploadClock = { now(): number; sleep(ms: number, signal: AbortSignal): Promise<void> }

export type RetryEnv = {
  clock: UploadClock
  net: UploadNetwork
  random: () => number
  /** Called when a wait for the connection begins, so the row can say "paused". */
  onOffline(): void
}

export const MAX_ATTEMPTS = 6
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30_000

export const browserNetwork: UploadNetwork = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  subscribe(listener) {
    window.addEventListener('online', listener)
    window.addEventListener('offline', listener)
    return () => {
      window.removeEventListener('online', listener)
      window.removeEventListener('offline', listener)
    }
  },
}

export const realClock: UploadClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason)
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', stop)
        resolve()
      }, ms)
      const stop = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      signal.addEventListener('abort', stop, { once: true })
    }),
}

/** Network failures, 5xx and a rate limit (not the in-progress cap) are worth retrying. */
export function isTransient(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!(error instanceof ORPCError)) return false
  if (error.code === 'TOO_MANY_REQUESTS') return errorReason(error) !== 'uploads_in_progress'
  return error.status >= 500
}

export function retryAfterMs(error: unknown): number | null {
  if (!(error instanceof ORPCError) || error.code !== 'TOO_MANY_REQUESTS') return null
  const data: unknown = error.data
  const seconds =
    typeof data === 'object' && data !== null && 'retryAfterSeconds' in data
      ? data.retryAfterSeconds
      : null
  return typeof seconds === 'number' ? seconds * 1000 : null
}

/** Equal jitter: half the capped exponential delay, plus a random share of the other half. */
export function backoff(attempt: number, random: () => number): number {
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1))
  return cap / 2 + random() * (cap / 2)
}

/** API calls: wait out offline spells, retry transient failures, honour Retry-After. */
export async function withRetry<T>(
  env: RetryEnv,
  signal: AbortSignal,
  call: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    await whenOnline(env, signal)
    try {
      return await call()
    } catch (error) {
      signal.throwIfAborted()
      if (!isTransient(error) || attempt >= MAX_ATTEMPTS) throw error
      if (error instanceof TypeError && !env.net.isOnline()) {
        attempt--
        continue
      }
      await env.clock.sleep(retryAfterMs(error) ?? backoff(attempt, env.random), signal)
    }
  }
}

/** Resolves at once when online; otherwise when the connection is back (or rejects on abort). */
export function whenOnline(env: RetryEnv, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const { net } = env
  if (net.isOnline()) return Promise.resolve()
  env.onOffline()
  return new Promise((resolve, reject) => {
    const done = () => {
      unsubscribe()
      signal.removeEventListener('abort', aborted)
    }
    const aborted = () => {
      done()
      reject(signal.reason)
    }
    const unsubscribe = net.subscribe(() => {
      if (!net.isOnline()) return
      done()
      resolve()
    })
    signal.addEventListener('abort', aborted, { once: true })
  })
}
