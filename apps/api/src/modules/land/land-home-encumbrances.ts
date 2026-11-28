import {
  type EncumbranceType,
  type LandBlockers,
  type LandHome,
  type LandNextDateQueueItem,
  NEXT_DATE_WINDOW_DAYS,
} from '@vento/shared'
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { entities, parcels } from '@/db/schema'
import { parcelEntityJoin, parcelScope } from './land-access'
import { blockedParcels, parcelBlockedSql } from './sales-block'

// Encumbrances on the homes (plan §7): the Land & legal tile and panel, the next-date queue
// items, and the executive home's blocked parcels. Bounded queries on the partial indexes, all
// within the company filter (decision 0014).

const day = (today: string) => sql`${today}::date`

const PANEL_ROWS = 5

type EntityRow = {
  entity_id: string
  name: string
  blocked: number
  oldest: string | null
  active: number
}

type PanelRow = {
  id: string
  parcel_id: string
  parcel_name: string
  type: EncumbranceType
  blocks_sales: boolean
  claimant: string | null
  reference: string | null
  served_on: string
  next_on: string | null
}

/**
 * The tile (blocked parcels, oldest, per company) and the panel (five active ones). Parcels of
 * an archived company are left out, as in the next-date queue (review #8): that company is
 * read-only and sells nothing. The claimant only for `seesDetails` viewers (never selected
 * otherwise).
 */
export async function encumbranceSection(
  db: DbOrTx,
  inView: SQL,
  seesDetails: boolean,
): Promise<LandHome['encumbrances']> {
  const counts = await db.execute<EntityRow>(sql`
    select ${parcels.entityId} as entity_id, ${entities.name} as name,
      (count(distinct ${parcels.id}) filter (where x.blocks_sales))::int as blocked,
      (min(x.served_on) filter (where x.blocks_sales))::text as oldest,
      count(*)::int as active
    from ${parcels}
    join ${entities} on ${parcelEntityJoin}
    join encumbrances x on x.organization_id = ${parcels.organizationId}
      and x.parcel_id = ${parcels.id} and x.status = 'active'
    where ${inView} and ${entities.status} <> 'archived'
    group by ${parcels.entityId}, ${entities.name}`)
  const panel = await db.execute<PanelRow>(sql`
    select x.id, ${parcels.id} as parcel_id, ${parcels.name} as parcel_name, x.type,
      x.blocks_sales, ${seesDetails ? sql`x.claimant` : sql`null`} as claimant, x.reference,
      x.served_on::text as served_on, x.next_on::text as next_on
    from encumbrances x
    join ${parcels} on ${parcels.organizationId} = x.organization_id and ${parcels.id} = x.parcel_id
    join ${entities} on ${parcelEntityJoin}
    where ${inView} and ${entities.status} <> 'archived' and x.status = 'active'
    order by x.blocks_sales desc, x.next_on nulls last, x.served_on, lower(${parcels.name}), x.id
    limit ${PANEL_ROWS}`)
  const rows = counts.rows
  const oldest = rows
    .map((r) => r.oldest)
    .filter((d): d is string => d !== null)
    .sort()[0]
  return {
    blockedParcels: rows.reduce((n, r) => n + r.blocked, 0),
    oldestBlockingSince: oldest ?? null,
    byEntity: rows
      .filter((r) => r.blocked > 0)
      .map((r) => ({ entityId: r.entity_id, name: r.name, count: r.blocked }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    activeCount: rows.reduce((n, r) => n + r.active, 0),
    active: panel.rows.map((r) => ({
      id: r.id,
      parcelId: r.parcel_id,
      parcelName: r.parcel_name,
      type: r.type,
      blocksSales: r.blocks_sales,
      claimant: r.claimant,
      reference: r.reference,
      servedOn: r.served_on,
      nextOn: r.next_on,
    })),
  }
}

type NextRow = {
  parcel_id: string
  parcel_name: string
  encumbrance_id: string
  type: EncumbranceType
  blocks_sales: boolean
  due: string
  days: number
}

/**
 * Hearings and next dates from 30 days ahead, and passed ones until someone sets the next
 * (owner, 28 Nov 2026). Parcels of an archived company are read-only, so they're left out.
 */
export async function nextDateItems(
  db: DbOrTx,
  inView: SQL,
  today: string,
  limit: number,
): Promise<LandNextDateQueueItem[]> {
  const result = await db.execute<NextRow>(sql`
    select ${parcels.id} as parcel_id, ${parcels.name} as parcel_name, x.id as encumbrance_id,
      x.type, x.blocks_sales, x.next_on::text as due, (${day(today)} - x.next_on)::int as days
    from encumbrances x
    join ${parcels} on ${parcels.organizationId} = x.organization_id and ${parcels.id} = x.parcel_id
    join ${entities} on ${parcelEntityJoin}
    where ${inView} and ${entities.status} <> 'archived' and x.status = 'active'
      and x.next_on is not null
      and x.next_on <= ${day(today)} + ${NEXT_DATE_WINDOW_DAYS}::int
    order by x.next_on, x.blocks_sales desc, lower(${parcels.name}), x.id
    limit ${limit}`)
  return result.rows.map((r) => ({
    kind: 'next_date',
    parcelId: r.parcel_id,
    parcelName: r.parcel_name,
    encumbranceId: r.encumbrance_id,
    encumbranceType: r.type,
    blocksSales: r.blocks_sales,
    due: r.due,
    days: r.days,
  }))
}

const BLOCKERS_LIMIT = 10

/**
 * The executive home's *Needs attention*: blocked parcels in the viewer's companies (and the
 * switcher's), oldest block first, at most 10, with what blocks each.
 */
export async function landBlockers(
  ctx: ServiceContext,
  input: { entityId?: string | undefined },
): Promise<LandBlockers> {
  const inView = and(
    parcelScope(ctx),
    isNull(parcels.archivedAt),
    input.entityId ? eq(parcels.entityId, input.entityId) : undefined,
    parcelBlockedSql,
  ) as SQL
  const result = await ctx.db.execute<{
    id: string
    name: string
    active: number
    since: string
    total: number
  }>(sql`
    select ${parcels.id} as id, ${parcels.name} as name,
      (select count(*) from encumbrances x where x.organization_id = ${parcels.organizationId}
        and x.parcel_id = ${parcels.id} and x.status = 'active')::int as active,
      (select min(x.served_on) from encumbrances x where x.organization_id = ${parcels.organizationId}
        and x.parcel_id = ${parcels.id} and x.status = 'active' and x.blocks_sales)::text as since,
      (count(*) over ())::int as total
    from ${parcels}
    where ${inView}
    order by since, lower(${parcels.name}), ${parcels.id}
    limit ${BLOCKERS_LIMIT}`)
  const blocks = await blockedParcels(
    ctx.db,
    ctx,
    result.rows.map((r) => r.id),
  )
  return {
    items: result.rows.flatMap((r) => {
      const block = blocks.get(r.id)
      if (!block) return []
      return [
        {
          parcelId: r.id,
          parcelName: r.name,
          type: block.type,
          reference: block.reference,
          others: Math.max(0, r.active - 1),
          since: r.since,
        },
      ]
    }),
    total: result.rows[0]?.total ?? 0,
  }
}
