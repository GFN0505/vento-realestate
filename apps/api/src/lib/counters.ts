import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

/** Kinds of per-organization record numbers. Receipts and POs add theirs here. */
export type CounterKind = 'parcel'

/**
 * The next number of this kind for the organization: 1, 2, 3… One upsert, so two creates at once
 * get different numbers (the second waits on the row lock) and a number is never handed out
 * twice, even if the record is archived later. Call it inside the record's transaction: a
 * rollback gives the number back, which is fine (the gap is never seen).
 */
export async function nextNumber(tx: DbOrTx, organizationId: string, kind: CounterKind) {
  const result = await tx.execute<{ last_value: number }>(sql`
    insert into record_counters (organization_id, kind, last_value)
    values (${organizationId}, ${kind}, 1)
    on conflict (organization_id, kind)
      do update set last_value = record_counters.last_value + 1, updated_at = now()
    returning last_value
  `)
  const value = result.rows[0]?.last_value
  if (value === undefined) throw new Error('record_counters upsert returned nothing')
  return value
}

/** Moves the counter up to at least `value` (seeds that insert numbered records directly). */
export async function raiseCounter(
  tx: DbOrTx,
  organizationId: string,
  kind: CounterKind,
  value: number,
): Promise<void> {
  await tx.execute(sql`
    insert into record_counters (organization_id, kind, last_value)
    values (${organizationId}, ${kind}, ${value})
    on conflict (organization_id, kind)
      do update set last_value = greatest(record_counters.last_value, excluded.last_value),
        updated_at = now()
  `)
}
