import { serve } from '@hono/node-server'
import { createApp } from '@/app'
import { db, pool } from '@/db/client'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import { startFeatureStore } from '@/platform/feature-store'

// The first snapshot loads before serving, so no request ever sees an empty one.
const features = await startFeatureStore(db, {
  refreshMs: env.FEATURE_SNAPSHOT_REFRESH_SECONDS * 1000,
})
const app = createApp({ db, features })

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
  features.stop()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
