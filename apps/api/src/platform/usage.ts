import type { CountLimitKey, FeatureKey } from '@vento/shared'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { entities, parcels } from '@/db/schema'

type Counter = (db: DbOrTx, organizationId: string) => Promise<number>

async function activeEntities(db: DbOrTx, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(entities)
    .where(and(eq(entities.organizationId, organizationId), eq(entities.status, 'active')))
  return row?.n ?? 0
}

/** Active members plus invitations still waiting for an answer (expired ones don't count). */
async function peopleInOrInvited(db: DbOrTx, organizationId: string): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    select
      (select count(*) from members
        where organization_id = ${organizationId} and status = 'active')::int
      + (select count(*) from invitations
        where organization_id = ${organizationId} and status = 'pending' and expires_at > now())::int
      as n
  `)
  return result.rows[0]?.n ?? 0
}

/**
 * What counts against each limit. Archived records never count. A module registers its counter
 * when it ships (projects with the Projects module); until then that limit isn't enforced.
 */
export const LIMIT_USAGE: Partial<Record<CountLimitKey, Counter>> = {
  entities: activeEntities,
  members: peopleInOrInvited,
}

/** Parcels not archived: what Land & title would hide if it became unavailable. */
async function activeParcels(db: DbOrTx, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(parcels)
    .where(and(eq(parcels.organizationId, organizationId), isNull(parcels.archivedAt)))
  return row?.n ?? 0
}

/**
 * Records that drop out of view when a feature becomes unavailable, for the command warning
 * ("Lekki Partners Ltd has 214 records in Sales"). Modules register theirs when they ship.
 */
export const FEATURE_RECORD_COUNTERS: Partial<Record<FeatureKey, Counter>> = {
  land: activeParcels,
}
