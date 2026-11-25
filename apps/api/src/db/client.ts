import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import * as schema from './schema'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Fail fast instead of hanging when the database is unreachable or a query runs away.
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 30_000,
})

// An idle client dropped by Postgres (restart, failover) emits here; without a listener it crashes the process.
pool.on('error', (error) => {
  logger.error('Idle database client error', { error: error.message })
})

// snake_case columns in Postgres, camelCase in TypeScript.
export const db = drizzle({ client: pool, schema, casing: 'snake_case' })
export type Db = typeof db

/** The database or an open transaction: services accept either, so tests can roll back. */
export type DbOrTx = PgDatabase<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>
