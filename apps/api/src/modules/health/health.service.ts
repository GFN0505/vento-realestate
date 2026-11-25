import type { HealthStatus } from '@vento/shared'
import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

export async function checkHealth(db: DbOrTx): Promise<HealthStatus> {
  const database = await db
    .execute(sql`select 1`)
    .then(() => 'up' as const)
    .catch(() => 'down' as const)
  return {
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    time: new Date().toISOString(),
  }
}
