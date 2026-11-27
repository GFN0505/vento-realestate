import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request facts that code deep in Better Auth hooks and audit writes needs, without
 * threading them through every call. Set once by a Hono middleware for each request.
 */
export type RequestScope = {
  requestId: string
  /** Full client address: kept in memory for rate limits only, never written to the database or logs. */
  ip: string | null
  ipMasked: string | null
  userAgent: string | null
  userAgentSummary: string | null
  /** Facts Better Auth before-hooks hand to after-hooks for the same request. */
  auth: {
    userId?: string
    /** `in_place`: we're calling the verifiers ourselves (turn-off, the console) and keep the books. */
    twoStepMode?: 'sign_in' | 'setup' | 'in_place'
    wasTwoFactorEnabled?: boolean
    /** The resend endpoint already counted this request against the limit. */
    verificationCounted?: boolean
    /** "Keep me signed in" for a passkey sign-in, from the x-vento-remember header. */
    rememberMe?: boolean
    /** The passkey sign-in challenge this request answers, read before the plugin consumes it. */
    passkeyChallenge?: string
    /** The 30-second step of the authenticator code this request sends, once it's matched. */
    totpStep?: number
    /**
     * A first sign-in (sign-up's automatic one, accepting an invitation): the browser is recorded
     * silently, with no "new sign-in" email.
     */
    firstSignIn?: boolean
    /**
     * A super-admin's reset sent this password link (console or command): the per-inbox hourly
     * cap doesn't apply, so a reset never leaves someone with no way back in (audit L7).
     */
    adminResetLink?: boolean
  }
}

const storage = new AsyncLocalStorage<RequestScope>()

export function runWithRequestScope<T>(scope: RequestScope, fn: () => T): T {
  return storage.run(scope, fn)
}

/** The current request's scope, or a blank one outside a request (seed, tests, jobs). */
export function requestScope(): RequestScope {
  return (
    storage.getStore() ?? {
      requestId: 'none',
      ip: null,
      ipMasked: null,
      userAgent: null,
      userAgentSummary: null,
      auth: {},
    }
  )
}
