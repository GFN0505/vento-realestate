import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request facts that code deep in Better Auth hooks and audit writes needs, without
 * threading them through every call. Set once by a Hono middleware for each request.
 */
export type RequestScope = {
  requestId: string
  /** Full client address: used for rate limits only, never stored or logged. */
  ip: string | null
  ipMasked: string | null
  userAgent: string | null
  userAgentSummary: string | null
  /** Facts Better Auth before-hooks hand to after-hooks for the same request. */
  auth: { userId?: string; twoStepMode?: 'sign_in' | 'setup'; wasTwoFactorEnabled?: boolean }
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
