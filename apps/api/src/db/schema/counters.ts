import { sql } from 'drizzle-orm'
import { check, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from '../columns'
import { organizations } from './organization'

/**
 * Per-organization record numbers (parcels P-0001 upwards; receipts and POs later). One row per
 * kind, bumped with a single upsert (lib/counters.ts), so numbers are never reused, even after
 * the record is archived.
 */
export const recordCounters = pgTable(
  'record_counters',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    kind: text().notNull(),
    lastValue: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: 'record_counters_pk', columns: [t.organizationId, t.kind] }),
    check('record_counters_positive', sql`${t.lastValue} >= 0`),
  ],
)
