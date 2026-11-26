import { getConnInfo } from '@hono/node-server/conninfo'
import { ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { ResponseHeadersPlugin } from '@orpc/server/plugins'
import { AUTH_BASE_PATH, errorReference } from '@vento/shared'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { type Auth, createAuth } from '@/auth/auth'
import { applySessionPolicy } from '@/auth/session-policy'
import type { Db } from '@/db/client'
import { createMailer, type Mailer } from '@/email/mailer'
import { env } from '@/env'
import { CLIENT_IP_HEADER, maskIp, resolveClientIp, userAgentLabel } from '@/lib/client-ip'
import { errorSummary } from '@/lib/error-summary'
import { logger } from '@/lib/logger'
import { createRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import { requestScope, runWithRequestScope } from '@/lib/request-scope'
import { checkHealth } from '@/modules/health/health.service'
import { type FeatureStore, liveFeatureStore } from '@/platform/feature-store'
import { router } from '@/router'
import { postmarkWebhook } from '@/webhooks/postmark'

export type AppDeps = {
  db: Db
  mailer?: Mailer
  auth?: Auth
  rateLimiter?: RateLimiter
  /** The server passes its refreshing store; tests default to one that reads on every call. */
  features?: FeatureStore
  /**
   * The bounce webhook's Basic-auth secret; the route exists only when this is set. Defaults to
   * POSTMARK_WEBHOOK_SECRET when Postmark is the transport.
   */
  postmarkWebhookSecret?: string | null
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

export function createApp(deps: AppDeps): Hono {
  const { db } = deps
  const mailer = deps.mailer ?? createMailer(env, { pruneDevMailbox: true })
  const auth = deps.auth ?? createAuth({ db, mailer })
  const rateLimiter = deps.rateLimiter ?? createRateLimiter()
  const features = deps.features ?? liveFeatureStore(db)
  const webhookSecret =
    deps.postmarkWebhookSecret === undefined
      ? env.EMAIL_TRANSPORT === 'postmark'
        ? env.POSTMARK_WEBHOOK_SECRET
        : undefined
      : deps.postmarkWebhookSecret

  const rpc = new RPCHandler(router, {
    plugins: [new ResponseHeadersPlugin()],
    // Inside the procedure call, so the converted error is checked against the shared error map.
    clientInterceptors: [
      async ({ next }) => {
        try {
          return await next()
        } catch (error) {
          // Expected errors (validation, not found, forbidden) are answers, not incidents.
          if (error instanceof ORPCError && error.status < 500) throw error
          const { requestId } = requestScope()
          const reference = errorReference(requestId, new Date())
          logger.error('Unhandled procedure error', {
            requestId,
            reference,
            ...errorSummary(error),
          })
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            status: 500,
            message: 'Something went wrong on our side',
            data: { reference },
          })
        }
      },
    ],
    interceptors: [
      onError((error) => {
        // Failures outside a procedure call (rare); procedure failures were logged above.
        if (error instanceof ORPCError && (error.status < 500 || error.data?.reference)) return
        logger.error('Unhandled RPC error', {
          requestId: requestScope().requestId,
          ...errorSummary(error),
        })
      }),
    ],
  })

  const app = new Hono()
  // Always our own id: a client-chosen one could collide with, or impersonate, another request's
  // error reference.
  app.use(requestId({ headerName: '' }))
  app.use(secureHeaders())
  app.use(compress())

  // Request id, masked client IP and device for logs, audit rows and Better Auth hooks.
  app.use('*', async (c, next) => {
    const ip = resolveClientIp(c.req.raw.headers, socketAddress(c), env.TRUSTED_IP_HEADER)
    const userAgent = c.req.header('user-agent') ?? null
    c.header('X-Request-Id', c.get('requestId'))
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
      if (current) await applySessionPolicy(db, current.session)
    }
    return auth.handler(new Request(c.req.raw, { headers }))
  })

  // Postmark's bounce and spam-complaint events (Hono, not oRPC: the payload is Postmark's shape).
  if (webhookSecret) {
    app.route('/webhooks/postmark', postmarkWebhook({ db, secret: webhookSecret, rateLimiter }))
  }

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
        featureStore: features,
      },
    })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

  return app
}
