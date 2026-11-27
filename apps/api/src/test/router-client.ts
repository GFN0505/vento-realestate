import { createRouterClient } from '@orpc/server'
import { ORGANIZATION_HEADER } from '@vento/shared'
import type { Auth } from '@/auth/auth'
import type { BaseContext } from '@/context'
import type { DbOrTx } from '@/db/client'
import { createMemoryTransport, type MemoryMailer } from '@/email/transports/memory'
import { createRateLimiter } from '@/lib/rate-limit'
import { type FeatureStore, liveFeatureStore } from '@/platform/feature-store'
import { router } from '@/router'
import { createMemoryStorage, type MemoryStorage } from '@/storage/memory-driver'
import type { TestUser } from './factories'

/**
 * Calls procedures in-process, through all middleware, as `user` (or anonymously). Better Auth's
 * session lookup is stubbed with a fresh session, so these tests can run inside a rolled-back
 * transaction. Real cookies and Better Auth are covered by the HTTP auth-flow tests.
 */
export function clientAs(
  db: DbOrTx,
  user: TestUser | null,
  options: {
    sessionId?: string
    activeOrganizationId?: string | null
    /** The organization the caller's tab is showing, sent as the tab-guard header. */
    expectedOrganizationId?: string
    /** Extra Better Auth server calls a procedure makes (requestPasswordReset, signInEmail). */
    authApi?: Record<string, (...args: never[]) => unknown>
    /** Availability source; by default read from `db` on every call, so changes show at once. */
    features?: FeatureStore
    /** Turn the in-memory rate limiter on (off by default, like the test environment). */
    rateLimit?: boolean
    /** Shared with the test, to upload parts and look at objects; a fresh one by default. */
    storage?: MemoryStorage
    /** Session fields beyond the defaults (a fresh session entered now, never confirmed). */
    session?: {
      createdAt?: Date
      organizationEnteredAt?: Date
      reauthenticatedAt?: Date | null
      secondFactorAt?: Date | null
      consoleOpenedAt?: Date | null
      consoleActiveAt?: Date | null
    }
  } = {},
) {
  const context = testContext(db, user, options)
  return {
    client: createRouterClient(router, { context }),
    mailer: context.mailer as MemoryMailer,
    storage: context.storage as MemoryStorage,
  }
}

/** The context `clientAs` passes, for test-only routers (the feature probe). */
export function testContext(
  db: DbOrTx,
  user: TestUser | null,
  options: Parameters<typeof clientAs>[2] = {},
): BaseContext {
  const now = new Date()
  const auth = {
    api: {
      getSession: async () =>
        user
          ? {
              user: { ...user, twoFactorEnabled: user.twoFactorEnabled },
              session: {
                id: options.sessionId ?? '01936f1e-8b2a-7c3d-9e4f-000000000000',
                userId: user.id,
                activeOrganizationId: options.activeOrganizationId ?? null,
                persistent: false,
                createdAt: options.session?.createdAt ?? now,
                lastActiveAt: now,
                organizationEnteredAt: options.session?.organizationEnteredAt ?? null,
                reauthenticatedAt: options.session?.reauthenticatedAt ?? null,
                secondFactorAt: options.session?.secondFactorAt ?? null,
                consoleOpenedAt: options.session?.consoleOpenedAt ?? null,
                consoleActiveAt: options.session?.consoleActiveAt ?? null,
              },
            }
          : null,
      ...options.authApi,
    },
  } as unknown as Auth
  const mailer = createMemoryTransport()
  return {
    db,
    requestId: 'test',
    headers: new Headers(
      options.expectedOrganizationId === undefined
        ? {}
        : { [ORGANIZATION_HEADER]: options.expectedOrganizationId },
    ),
    auth,
    mailer,
    storage: options.storage ?? createMemoryStorage(),
    rateLimiter: createRateLimiter(options.rateLimit ?? false),
    featureStore: options.features ?? liveFeatureStore(db),
  }
}

/** The console window states a test can start from (admin-console plan §11). */
export type ConsoleWindowState = 'open' | 'closed' | 'idle' | 'expired'

const MINUTE = 60_000

function windowFields(state: ConsoleWindowState, now: number) {
  const at = (ms: number) => new Date(now - ms)
  switch (state) {
    case 'open':
      return { consoleOpenedAt: at(MINUTE), consoleActiveAt: at(MINUTE) }
    case 'idle':
      return { consoleOpenedAt: at(20 * MINUTE), consoleActiveAt: at(15 * MINUTE + 1000) }
    case 'expired':
      return { consoleOpenedAt: at(8 * 60 * MINUTE), consoleActiveAt: at(0) }
    default:
      return { consoleOpenedAt: null, consoleActiveAt: null }
  }
}

/** `clientAs` for the Vento console, with the window open by default. */
export function consoleClientAs(
  db: DbOrTx,
  user: TestUser | null,
  options: Parameters<typeof clientAs>[2] & { window?: ConsoleWindowState } = {},
) {
  const { window = 'open', ...rest } = options
  return clientAs(db, user, {
    ...rest,
    session: { ...windowFields(window, Date.now()), ...rest.session },
  })
}
