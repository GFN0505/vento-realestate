import { serve } from '@hono/node-server'
import { createApp } from '@/app'
import { db, pool } from '@/db/client'
import { env } from '@/env'
import { logger } from '@/lib/logger'

const app = createApp({ db })

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info('API listening', { port: info.port, env: env.NODE_ENV })
})

const SHUTDOWN_TIMEOUT_MS = 10_000

// Stop taking new requests, let in-flight ones finish, then close the database pool.
async function shutdown(signal: string) {
  logger.info('Shutting down', { signal })
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out; exiting')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    if ('closeIdleConnections' in server) server.closeIdleConnections()
  })
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
