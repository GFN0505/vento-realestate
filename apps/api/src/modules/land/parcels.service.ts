import {
  type ListParcelsOutput,
  type listParcelsInput,
  type ParcelDetail,
  parseParcelReference,
} from '@vento/shared'
import { and, asc, desc, eq, ilike, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ServiceContext } from '@/access/context'
import { runQueries } from '@/db/run-queries'
import { entities, parcels } from '@/db/schema'
import { likePattern } from '@/lib/like'
import { pageOffset } from '@/lib/paginate'
import { encumbranceSummaries } from './encumbrance-read'
import { parcelColumns, parcelEntityJoin, parcelScope } from './land-access'
import { canSeeEncumbranceDetails } from './land-visibility'
import { parcelDetail, stageSummaries, toParcelRow } from './parcel-read'
import { parcelBlockedSql } from './sales-block'

// Parcels (plan §3–§5): the list, the detail and the name hint. Add parcel is in
// parcel-create.service.ts; edit, archive and restore in parcel-changes.service.ts.

type ListInput = z.output<typeof listParcelsInput>

/** `in_progress` = not archived, not titled, any stage under way; Home's tile uses the same. */
export const inProgressCondition = sql`${parcels.status} <> 'titled' and exists (
  select 1 from title_stages s
  where s.organization_id = ${parcels.organizationId} and s.parcel_id = ${parcels.id}
    and s.status <> 'not_started')`

/** Any active encumbrance, blocking or not (owner, 28 Nov 2026): every claim on the land. */
const parcelEncumberedSql = sql`exists (select 1 from encumbrances e
  where e.organization_id = ${parcels.organizationId} and e.parcel_id = ${parcels.id}
    and e.status = 'active')`

function filterCondition(filter: ListInput['filter']): SQL | undefined {
  switch (filter) {
    case 'titled':
      return and(isNull(parcels.archivedAt), eq(parcels.status, 'titled'))
    case 'in_progress':
      return and(isNull(parcels.archivedAt), inProgressCondition)
    case 'encumbered':
      return and(isNull(parcels.archivedAt), parcelEncumberedSql)
    case 'archived':
      return isNotNull(parcels.archivedAt)
    default:
      return isNull(parcels.archivedAt)
  }
}

function searchCondition(q: string | undefined): SQL | undefined {
  if (!q) return undefined
  const pattern = likePattern(q)
  const n = parseParcelReference(q)
  return or(
    ilike(parcels.name, pattern),
    ilike(parcels.area, pattern),
    ilike(parcels.lga, pattern),
    n === null ? undefined : eq(parcels.referenceNumber, n),
  )
}

const SORTS = {
  name: sql`lower(${parcels.name})`,
  reference: parcels.referenceNumber,
  size: parcels.sizeSqm,
  updated: parcels.updatedAt,
} as const

/**
 * The parcels list: the viewer's companies ∩ the switcher's (decision 0014), filters, search by
 * name, area, LGA or reference, and a summary of every non-archived parcel in view.
 */
export async function listParcels(
  ctx: ServiceContext,
  input: ListInput,
): Promise<ListParcelsOutput> {
  const inView = and(
    parcelScope(ctx),
    input.entityId ? eq(parcels.entityId, input.entityId) : undefined,
  )
  const where = and(inView, filterCondition(input.filter), searchCondition(input.q))
  const order = input.dir === 'desc' ? desc : asc
  const { limit, offset } = pageOffset(input)
  const [rows, [count], [summary]] = await runQueries(ctx.db, [
    () =>
      ctx.db
        .select(parcelColumns(ctx))
        .from(parcels)
        .innerJoin(entities, parcelEntityJoin)
        .where(where)
        .orderBy(order(SORTS[input.sort]), order(parcels.id))
        .limit(limit)
        .offset(offset),
    () => ctx.db.select({ n: sql<number>`count(*)::int` }).from(parcels).where(where),
    () =>
      ctx.db
        .select({
          count: sql<number>`count(*)::int`,
          totalSqm: sql<string>`coalesce(sum(${parcels.sizeSqm}), 0)::numeric(20, 2)::text`,
          // Only parcels whose sales are blocked: a non-blocking mortgage isn't "blocked".
          blocked: sql<number>`(count(*) filter (where ${parcelBlockedSql}))::int`,
        })
        .from(parcels)
        .where(and(inView, isNull(parcels.archivedAt))),
  ])
  const ids = rows.map((r) => r.id)
  const [stages, encumbrance] = await runQueries(ctx.db, [
    () => stageSummaries(ctx.db, ctx.organizationId, ids),
    () =>
      encumbranceSummaries(ctx.db, ctx.organizationId, ids, canSeeEncumbranceDetails(ctx.member)),
  ])
  return {
    items: rows.map((r) =>
      toParcelRow(ctx, r, stages.get(r.id) ?? [], encumbrance.get(r.id) ?? null),
    ),
    page: input.page,
    pageSize: input.pageSize,
    total: count?.n ?? 0,
    summary: {
      count: summary?.count ?? 0,
      totalSqm: summary?.totalSqm ?? '0.00',
      blocked: summary?.blocked ?? 0,
    },
  }
}

export async function getParcel(ctx: ServiceContext, id: string): Promise<ParcelDetail> {
  return parcelDetail(ctx.db, ctx, id)
}

/** "There's already a parcel called … Open it": an active parcel in the viewer's companies. */
export async function parcelNameTaken(
  ctx: ServiceContext,
  input: { name: string; excludeId?: string | undefined },
): Promise<{ id: string; name: string } | null> {
  const [row] = await ctx.db
    .select({ id: parcels.id, name: parcels.name })
    .from(parcels)
    .where(
      and(
        parcelScope(ctx),
        isNull(parcels.archivedAt),
        sql`lower(${parcels.name}) = lower(${input.name})`,
        input.excludeId ? ne(parcels.id, input.excludeId) : undefined,
      ),
    )
    .limit(1)
  return row ?? null
}
