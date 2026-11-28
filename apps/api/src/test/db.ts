import { sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back, so tests never see each other's rows. */
export async function withRollback(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

let counter = 0
/** A unique token for test names (organizations, entities), so no name ever contains an email. */
export function uniqueSuffix(): string {
  counter += 1
  return `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`
}

/** A unique lower-case email per call, for tests that commit (auth flows). */
export function uniqueEmail(name = 'person'): string {
  counter += 1
  return `${name}.${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}@test.vento.ng`
}

/**
 * Tables with a BEFORE TRUNCATE statement trigger (the history guards), from pg_trigger. Guard
 * tests check this instead of running TRUNCATE: its ACCESS EXCLUSIVE locks deadlock with test
 * files running in parallel. tgtype bits: 2 = BEFORE, 32 = TRUNCATE.
 */
export async function truncateGuardedTables(tx: DbOrTx): Promise<string[]> {
  const result = await tx.execute<{ name: string }>(sql`
    select distinct c.relname as name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgenabled <> 'D'
      and (t.tgtype & 2) <> 0 and (t.tgtype & 32) <> 0
    order by 1
  `)
  return result.rows.map((r) => r.name)
}
