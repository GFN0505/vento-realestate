import type { Auth } from '@/auth/auth'
import type { BreachCheck } from '@/auth/password-policy'
import type { DbOrTx } from '@/db/client'
import type { Mailer } from '@/email/mailer'
import type { RateLimiter } from '@/lib/rate-limit'

/** What every procedure receives. */
export type BaseContext = {
  /** The pool, or a transaction in tests. */
  db: DbOrTx
  requestId: string
  /** Request headers (cookies), for Better Auth session lookups. */
  headers: Headers
  /** Response headers (Set-Cookie), filled by oRPC's ResponseHeadersPlugin. */
  resHeaders?: Headers
  auth: Auth
  mailer: Mailer
  rateLimiter: RateLimiter
  /** Breached-password check shared with Better Auth; null when off. */
  breachCheck: BreachCheck | null
}
