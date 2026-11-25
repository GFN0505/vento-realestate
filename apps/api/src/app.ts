import { getConnInfo } from '@hono/node-server/conninfo'
import { ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { ResponseHeadersPlugin } from '@orpc/server/plugins'
import { AUTH_BASE_PATH } from '@vento/shared'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { type Auth, createAuth } from '@/auth/auth'
import { enforceSessionPolicy } from '@/auth/session-policy'
import type { Db } from '@/db/client'
import { createMailer, type Mailer } from '@/email/mailer'
import { env } from '@/env'
import { CLIENT_IP_HEADER, maskIp, resolveClientIp, userAgentLabel } from '@/lib/client-ip'
import { logger } from '@/lib/logger'
import { createRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import { requestScope, runWithRequestScope } from '@/lib/request-scope'
import { checkHealth } from '@/modules/health/health.service'
import { router } from '@/router'

export type AppDeps = {
  db: Db
  mailer?: Mailer
  auth?: Auth
  rateLimiter?: RateLimiter
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address
  } catch {
    // app.request() in tests has no socket.
    return undefined
  }
}

/** Request headers with our client-IP header set from a trusted source, never from the client. */
function trustedHeaders(c: Context): Headers {
  const headers = new Headers(c.req.raw.headers)
  headers.delete(CLIENT_IP_HEADER)
  const ip = requestScope().ip
  if (ip) headers.set(CLIENT_IP_HEADER, ip)
  return headers
}

const LOCKABLE_PATHS = /\/(sign-in\/email|two-factor\/verify-(totp|backup-code))$/

/**
 * Our after-hooks turn the failure that triggers a lock into ACCOUNT_LOCKED, but Better Auth
 * keeps the endpoint's original status (401). Lockouts are always 429 for the web.
 */
async function withLockStatus(res: Response): Promise<Response> {
  if (res.status === 429 || res.status < 400) return res
  const body = await res.clone().text()
  if (!body.includes('"ACCOUNT_LOCKED"')) return res
  return new Response(body, { status: 429, headers: res.headers })
}

export function createApp(deps: AppDeps): Hono {
  const { db } = deps
  const mailer = deps.mailer ?? createMailer(env)
  const auth = deps.auth ?? createAuth({ db, mailer })
  const rateLimiter = deps.rateLimiter ?? createRateLimiter()

  const rpc = new RPCHandler(router, {
    plugins: [new ResponseHeadersPlugin()],
    interceptors: [
      onError((error) => {
        // Expected errors (validation, not found, forbidden) are answers, not incidents.
        if (error instanceof ORPCError && error.status < 500) return
        logger.error('Unhandled procedure error', {
          requestId: requestScope().requestId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      }),
    ],
  })

  const app = new Hono()
  app.use(requestId())
  app.use(secureHeaders())
  app.use(compress())

  // Request id, masked client IP and device for logs, audit rows and Better Auth hooks.
  app.use('*', async (c, next) => {
    const ip = resolveClientIp(c.req.raw.headers, socketAddress(c), env.TRUSTED_IP_HEADER)
    const userAgent = c.req.header('user-agent') ?? null
    const scope = {
      requestId: c.get('requestId'),
      ip,
      ipMasked: maskIp(ip),
      userAgent,
      userAgentSummary: userAgentLabel(userAgent),
      auth: {},
    }
    await runWithRequestScope(scope, async () => {
      const started = performance.now()
      await next()
      logger.info('request', {
        requestId: scope.requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      })
    })
  })

  // Plain endpoint for uptime checks and load balancers.
  app.get('/health', async (c) => {
    const health = await checkHealth(db)
    return c.json(health, health.status === 'ok' ? 200 : 503)
  })

  // Better Auth: sign-up, sign-in, verify, two-step, reset (decision 0009: same origin).
  app.use(`${AUTH_BASE_PATH}/*`, bodyLimit({ maxSize: 64 * 1024 }))
  app.on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, async (c) => {
    const headers = trustedHeaders(c)
    // Apply our idle and 12-hour rules first, so Better Auth never serves an expired session.
    if (/vento\.session_token=/.test(headers.get('cookie') ?? '')) {
      const current = await auth.api.getSession({ headers })
      if (current) {
        const s = current.session
        await enforceSessionPolicy(db, {
          id: s.id,
          persistent: Boolean(s.persistent),
          createdAt: new Date(s.createdAt),
          lastActiveAt: new Date(s.lastActiveAt ?? s.createdAt),
        })
      }
    }
    const res = await auth.handler(new Request(c.req.raw, { headers }))
    return LOCKABLE_PATHS.test(c.req.path) ? withLockStatus(res) : res
  })

  // JSON calls are small; file uploads get their own endpoints with their own limits.
  app.use('/rpc/*', bodyLimit({ maxSize: 1024 * 1024 }))

  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: '/rpc',
      context: {
        db,
        requestId: c.get('requestId'),
        headers: trustedHeaders(c),
        auth,
        mailer,
        rateLimiter,
      },
    })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

  return app
}
