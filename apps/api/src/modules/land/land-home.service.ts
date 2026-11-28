import {
  hasPermission,
  type LandHome,
  type LandQueueItem,
  type LandStageQueueItem,
  STALLED_AFTER_DAYS,
  TITLE_STAGE_TYPES,
  type TitleStageStatus,
  type TitleStageType,
} from '@vento/shared'
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { entities, parcels } from '@/db/schema'
import { lagosToday, parcelEntityJoin, parcelScope } from './land-access'
import { encumbranceSection, nextDateItems } from './land-home-encumbrances'
import { canSeeEncumbranceDetails } from './land-visibility'
import { inProgressCondition } from './parcels.service'

// The Land & legal home (plan §7): the Titles in progress tile, the Title pipeline panel and the
// queue; encumbrances (slice 2) in land-home-encumbrances.ts. Everything follows the company filter (decision 0014), counted in SQL on Lagos calendar
// days (date arithmetic, so the stalled boundary is exact).

type StageFact = {
  status: TitleStageStatus
  statusOn: string | null
  followUpOn: string | null
}

const DAY_MS = 86_400_000

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/**
 * At most one queue item per stage: a query first, then a due follow-up, then stalled. The
 * rule in words for tests and the web; queueOf runs the same rule in SQL.
 */
export function queueItemFor(
  stage: StageFact,
  today: string,
): { kind: LandStageQueueItem['kind']; due: string } | null {
  if (stage.status === 'queried' && stage.statusOn) return { kind: 'query', due: stage.statusOn }
  if (stage.followUpOn && stage.followUpOn <= today) {
    return { kind: 'follow_up', due: stage.followUpOn }
  }
  const moving = stage.status === 'in_progress' || stage.status === 'submitted'
  if (
    moving &&
    stage.statusOn &&
    !stage.followUpOn &&
    daysBetween(stage.statusOn, today) >= STALLED_AFTER_DAYS
  ) {
    return { kind: 'stalled', due: stage.statusOn }
  }
  return null
}

const PIPELINE_PARCELS = 5
const QUEUE_LIMIT = 20

/**
 * The Land & legal home. Three bounded queries, whatever the number of parcels: counts grouped by
 * company, the pipeline's top five per stage, and the queue with its limit of 20 (review: it
 * used to load every parcel and stage). Lagos calendar days; the rules match queueItemFor.
 */
export async function landHome(
  ctx: ServiceContext,
  input: { entityId?: string | undefined },
  now: Date = new Date(),
): Promise<LandHome> {
  const today = lagosToday(now)
  const inView = and(
    parcelScope(ctx),
    isNull(parcels.archivedAt),
    input.entityId ? eq(parcels.entityId, input.entityId) : undefined,
  ) as SQL
  const canAct = hasPermission(ctx.member.permissions, 'land', 'edit')
  const [counts, pipelineRows, queueRows, nextRows, encumbrances] = await runQueries(ctx.db, [
    () => countsByEntity(ctx.db, inView, today),
    () => pipelineOf(ctx.db, inView, today),
    async () => (canAct ? queueOf(ctx.db, inView, today) : []),
    async () => (canAct ? nextDateItems(ctx.db, inView, today, QUEUE_LIMIT) : []),
    () => encumbranceSection(ctx.db, inView, canSeeEncumbranceDetails(ctx.member)),
  ])
  const inProgress = counts.filter((c) => c.inProgress > 0)
  return {
    hasParcels: counts.some((c) => c.total > 0),
    titlesInProgress: {
      count: inProgress.reduce((n, c) => n + c.inProgress, 0),
      stalled: counts.reduce((n, c) => n + c.stalled, 0),
      byEntity: inProgress
        .map((c) => ({ entityId: c.entityId, name: c.name, count: c.inProgress }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    },
    pipeline: TITLE_STAGE_TYPES.flatMap((stageType) => {
      const list = pipelineRows.filter((r) => r.type === stageType)
      const first = list[0]
      if (!first) return []
      return [
        {
          stageType,
          count: first.n,
          parcels: list.map((r) => ({ id: r.id, name: r.name, sinceDays: r.since })),
        },
      ]
    }),
    titledCount: counts.reduce((n, c) => n + c.titled, 0),
    encumbrances,
    queue: mergeQueue(queueRows, nextRows),
  }
}

/**
 * Stage items and next dates in one queue: by due date, then impact (an encumbrance that blocks
 * sales first, then query, follow-up, stalled, other next dates), at most 20.
 */
export function mergeQueue(
  stages: readonly LandQueueItem[],
  next: readonly LandQueueItem[],
): LandQueueItem[] {
  const rank = (q: LandQueueItem): number => {
    if (q.kind === 'next_date') return q.blocksSales ? 0 : 4
    return { query: 1, follow_up: 2, stalled: 3 }[q.kind]
  }
  return [...stages, ...next]
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) ||
        rank(a) - rank(b) ||
        a.parcelName.toLowerCase().localeCompare(b.parcelName.toLowerCase()),
    )
    .slice(0, QUEUE_LIMIT)
}

const day = (today: string) => sql`${today}::date`

/** A stage moving (in progress or submitted) with no follow-up date, 90 days without news. */
const stalledStage = (today: string) => sql`(s.status in ('in_progress', 'submitted')
  and s.status_on is not null and s.follow_up_on is null
  and s.status_on <= ${day(today)} - ${STALLED_AFTER_DAYS}::int)`

type EntityCounts = {
  entityId: string
  name: string
  total: number
  titled: number
  inProgress: number
  stalled: number
}

async function countsByEntity(db: DbOrTx, inView: SQL, today: string): Promise<EntityCounts[]> {
  const stalled = sql`exists (select 1 from title_stages s
    where s.organization_id = ${parcels.organizationId} and s.parcel_id = ${parcels.id}
      and ${stalledStage(today)})`
  return db
    .select({
      entityId: parcels.entityId,
      name: entities.name,
      total: sql<number>`count(*)::int`,
      titled: sql<number>`(count(*) filter (where ${parcels.status} = 'titled'))::int`,
      inProgress: sql<number>`(count(*) filter (where ${inProgressCondition}))::int`,
      stalled: sql<number>`(count(*) filter (where ${inProgressCondition} and ${stalled}))::int`,
    })
    .from(parcels)
    .innerJoin(entities, parcelEntityJoin)
    .where(inView)
    .groupBy(parcels.entityId, entities.name)
}

type PipelineRow = { type: TitleStageType; n: number; id: string; name: string; since: number }

/** Each parcel's current stage (first not granted, catalog = enum order); five longest per stage. */
async function pipelineOf(db: DbOrTx, inView: SQL, today: string): Promise<PipelineRow[]> {
  const result = await db.execute<PipelineRow>(sql`
    with current_stage as (
      select ${parcels.id} as id, ${parcels.name} as name, c.type,
        greatest(0, ${day(today)} - coalesce(c.status_on,
          (c.created_at at time zone 'Africa/Lagos')::date))::int as since
      from ${parcels}
      cross join lateral (
        select s.type, s.status_on, s.created_at from title_stages s
        where s.organization_id = ${parcels.organizationId} and s.parcel_id = ${parcels.id}
          and s.status <> 'granted'
        order by s.type limit 1
      ) c
      where ${inView} and ${parcels.status} not in ('titled', 'in_development', 'sold_out')
    ), ranked as (
      select *, count(*) over (partition by type)::int as n,
        row_number() over (partition by type order by since desc, lower(name), id) as rn
      from current_stage
    )
    select type, n, id, name, since from ranked where rn <= ${PIPELINE_PARCELS} order by type, rn
  `)
  return result.rows
}

/** At most one item per stage (a query, then a due follow-up, then stalled), oldest due first. */
async function queueOf(db: DbOrTx, inView: SQL, today: string): Promise<LandStageQueueItem[]> {
  const result = await db.execute<{
    kind: LandStageQueueItem['kind']
    parcel_id: string
    parcel_name: string
    stage_id: string
    stage_type: TitleStageType
    due: string
    days: number
  }>(sql`
    with item as (
      select ${parcels.id} as parcel_id, ${parcels.name} as parcel_name, s.id as stage_id,
        s.type as stage_type,
        case
          when s.status = 'queried' and s.status_on is not null then 'query'
          when s.follow_up_on <= ${day(today)} then 'follow_up'
          when ${stalledStage(today)} then 'stalled'
        end as kind,
        case
          when s.status = 'queried' and s.status_on is not null then s.status_on
          when s.follow_up_on <= ${day(today)} then s.follow_up_on
          else s.status_on
        end as due
      from title_stages s
      join ${parcels} on ${parcels.organizationId} = s.organization_id and ${parcels.id} = s.parcel_id
      join ${entities} on ${parcelEntityJoin}
      -- A parcel of an archived company is read-only: nothing to act on.
      where ${inView} and ${entities.status} <> 'archived'
    )
    select kind, parcel_id, parcel_name, stage_id, stage_type, due::text as due,
      (${day(today)} - due)::int as days
    from item where kind is not null
    order by due, array_position(array['query', 'follow_up', 'stalled'], kind),
      lower(parcel_name), stage_id
    limit ${QUEUE_LIMIT}
  `)
  return result.rows.map((r) => ({
    kind: r.kind,
    parcelId: r.parcel_id,
    parcelName: r.parcel_name,
    stageId: r.stage_id,
    stageType: r.stage_type,
    due: r.due,
    days: r.days,
  }))
}
