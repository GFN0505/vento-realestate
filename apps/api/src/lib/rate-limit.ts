import { env } from '@/env'

type Window = { count: number; resetAt: number }

/**
 * Fixed-window limiter in memory, for public token-gated procedures. Tokens are 256-bit, so
 * this guards against abuse rather than guessing. One API instance today; move to the
 * database or Redis when there are several.
 */
export function createRateLimiter(enabled = env.AUTH_RATE_LIMIT === 'on') {
  const windows = new Map<string, Window>()
  return {
    /** Seconds to wait, or 0 when the call may go ahead. */
    hit(key: string, max: number, windowMs = 60_000): number {
      if (!enabled) return 0
      const now = Date.now()
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k)
      }
      const current = windows.get(key)
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs })
        return 0
      }
      current.count += 1
      return current.count > max ? Math.ceil((current.resetAt - now) / 1000) : 0
    },
  }
}
export type RateLimiter = ReturnType<typeof createRateLimiter>
