import { createRouterClient } from '@orpc/server'
import type { Auth } from '@/auth/auth'
import type { BaseContext } from '@/context'
import type { DbOrTx } from '@/db/client'
import { createMemoryTransport } from '@/email/transports/memory'
import { createRateLimiter } from '@/lib/rate-limit'
import { router } from '@/router'
import type { TestUser } from './factories'

/**
 * Calls procedures in-process, through all middleware, as `user` (or anonymously). Better Auth's
 * session lookup is stubbed with a fresh session, so these tests can run inside a rolled-back
 * transaction. Real cookies and Better Auth are covered by the HTTP auth-flow tests.
 */
export function clientAs(
  db: DbOrTx,
  user: TestUser | null,
  options: { sessionId?: string; activeOrganizationId?: string | null } = {},
) {
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
                createdAt: now,
                lastActiveAt: now,
              },
            }
          : null,
    },
  } as unknown as Auth
  const mailer = createMemoryTransport()
  const context: BaseContext = {
    db,
    requestId: 'test',
    headers: new Headers(),
    auth,
    mailer,
    rateLimiter: createRateLimiter(false),
  }
  return { client: createRouterClient(router, { context }), mailer }
}
