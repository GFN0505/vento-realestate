import { ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Db } from '@/db/client'
import { logger } from '@/lib/logger'
import { checkHealth } from '@/modules/health/health.service'
import { router } from '@/router'

export function createApp({ db }: { db: Db }) {
  const rpc = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        // Expected errors (validation, not found, forbidden) are answers, not incidents.
        if (error instanceof ORPCError && error.status < 500) return
        logger.error('Unhandled procedure error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      }),
    ],
  })

  const app = new Hono()
  app.use(requestId())
  app.use(secureHeaders())

  app.use('*', async (c, next) => {
    const started = performance.now()
    await next()
    logger.info('request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    })
  })

  // Plain endpoint for uptime checks and load balancers.
  app.get('/health', async (c) => {
    const health = await checkHealth(db)
    return c.json(health, health.status === 'ok' ? 200 : 503)
  })

  // JSON calls are small; file uploads get their own endpoints with their own limits.
  app.use('/rpc/*', bodyLimit({ maxSize: 1024 * 1024 }))

  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: '/rpc',
      context: { db, requestId: c.get('requestId') },
    })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

  return app
}
