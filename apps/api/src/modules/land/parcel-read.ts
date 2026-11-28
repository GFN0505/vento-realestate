import {
  currentStageOf,
  hasPermission,
  inCatalogOrder,
  type NigerianState,
  type ParcelDetail,
  type ParcelRow,
  parcelReference,
  STAGE_UNDO_SECONDS,
  type TitleStage,
  type TitleStageType,
} from '@vento/shared'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { auditEvents, parcels, titleStages, users } from '@/db/schema'
import { actorFor, actorStandingOf } from '@/modules/audit/audit-read.service'
import { documentsOf } from './document-read'
import {
  canSeeCost,
  loadParcel,
  type ParcelRecord,
  parcelScope,
  readOnlyReason,
} from './land-access'

// How parcels read: the list row and the detail page (plan §4). Batched by parcel ids, never one
// query per parcel.

type Ctx = Pick<ServiceContext, 'organizationId' | 'member' | 'user'>

export type StageSummaryRow = {
  parcelId: string
  type: TitleStageType
  status: TitleStage['status']
  statusOn: string | null
}

/** Every stage of these parcels (type, status, date), for the list's Title stage column. */
export async function stageSummaries(
  db: DbOrTx,
  organizationId: string,
  parcelIds: string[],
): Promise<Map<string, StageSummaryRow[]>> {
  const byParcel = new Map<string, StageSummaryRow[]>()
  if (parcelIds.length === 0) return byParcel
  const rows = await db
    .select({
      parcelId: titleStages.parcelId,
      type: titleStages.type,
      status: titleStages.status,
      statusOn: titleStages.statusOn,
    })
    .from(titleStages)
    .where(
      and(eq(titleStages.organizationId, organizationId), inArray(titleStages.parcelId, parcelIds)),
    )
  for (const row of rows) byParcel.set(row.parcelId, [...(byParcel.get(row.parcelId) ?? []), row])
  return byParcel
}

export function toParcelRow(
  ctx: Pick<ServiceContext, 'member'>,
  p: ParcelRecord,
  stages: readonly Omit<StageSummaryRow, 'parcelId'>[],
): ParcelRow {
  const current = currentStageOf(stages)
  const costVisible = canSeeCost(ctx.member)
  return {
    id: p.id,
    reference: parcelReference(p.referenceNumber),
    referenceNumber: p.referenceNumber,
    name: p.name,
    state: p.state as NigerianState,
    lga: p.lga,
    area: p.area,
    sizeSqm: p.sizeSqm,
    sizeUnit: p.sizeUnit,
    sizeEntered: p.sizeEntered,
    plotSizeSqm: p.plotSizeSqm,
    status: p.status,
    entity: { id: p.entityId, name: p.entityName, archived: p.entityArchived },
    archivedAt: p.archivedAt?.toISOString() ?? null,
    currentStage: current
      ? { type: current.type, status: current.status, statusOn: current.statusOn }
      : null,
    stagesGranted: stages.filter((s) => s.status === 'granted').length,
    stagesTotal: stages.length,
    acquisition: costVisible
      ? { cost: p.acquisitionCost, currency: 'NGN', on: p.acquiredOn }
      : null,
    costHidden: !costVisible,
    updatedAt: p.updatedAt.toISOString(),
  }
}

/** One parcel's row (after a write), read again with its stages. */
export async function parcelRow(db: DbOrTx, ctx: Ctx, id: string): Promise<ParcelRow> {
  const parcel = await loadParcel(db, ctx, id)
  const stages = await stageSummaries(db, ctx.organizationId, [id])
  return toParcelRow(ctx, parcel, stages.get(id) ?? [])
}

async function stagesOf(db: DbOrTx, ctx: Ctx, parcelId: string): Promise<TitleStage[]> {
  const rows = await db
    .select({
      id: titleStages.id,
      type: titleStages.type,
      status: titleStages.status,
      statusOn: titleStages.statusOn,
      reference: titleStages.reference,
      issuedBy: titleStages.issuedBy,
      note: titleStages.note,
      followUpOn: titleStages.followUpOn,
      version: titleStages.version,
      updatedAt: titleStages.updatedAt,
      updatedByUserId: titleStages.updatedByUserId,
      updatedByName: users.name,
      updatedByStanding: actorStandingOf(titleStages.updatedByUserId, titleStages.organizationId),
    })
    .from(titleStages)
    .leftJoin(users, eq(users.id, titleStages.updatedByUserId))
    .where(
      and(eq(titleStages.organizationId, ctx.organizationId), eq(titleStages.parcelId, parcelId)),
    )
  const undoAfter = Date.now() - STAGE_UNDO_SECONDS * 1000
  const recent = rows.filter(
    (s) => s.updatedByUserId === ctx.user.id && s.updatedAt.getTime() > undoAfter && s.version > 1,
  )
  const notUndoable = await undoneVersions(db, ctx, parcelId, recent)
  return inCatalogOrder(rows).map(
    ({ updatedByUserId, updatedByName, updatedByStanding, updatedAt, ...s }) => ({
      ...s,
      updatedAt: updatedAt.toISOString(),
      // Named as the audit log names people: someone outside the organization isn't.
      updatedBy: updatedByName
        ? {
            name: actorFor({
              actorUserId: updatedByUserId,
              actorName: updatedByName,
              actorStanding: updatedByStanding,
            }).name,
          }
        : null,
      canUndo: recent.some((r) => r.id === s.id) && !notUndoable.has(`${s.id}:${s.version}`),
    }),
  )
}

/**
 * Of these recent stage versions, the ones an Undo made: Undo isn't offered on them (undoing an
 * undo is refused). One query, only when the caller has something recent.
 */
async function undoneVersions(
  db: DbOrTx,
  ctx: Ctx,
  parcelId: string,
  recent: { id: string; version: number }[],
): Promise<Set<string>> {
  if (recent.length === 0) return new Set()
  const rows = await db
    .select({
      stageId: sql<string>`${auditEvents.metadata}->>'stageId'`,
      version: sql<number>`(${auditEvents.metadata}->>'version')::int`,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.targetType, 'parcel'),
        eq(auditEvents.targetId, parcelId),
        eq(auditEvents.action, 'land.title_stage.updated'),
        sql`${auditEvents.metadata}->>'undo' = 'true'`,
        inArray(
          sql`${auditEvents.metadata}->>'stageId'`,
          recent.map((r) => r.id),
        ),
      ),
    )
  return new Set(rows.map((r) => `${r.stageId}:${r.version}`))
}

/** The issuer last recorded for each stage type on this organization's parcels in the state. */
async function suggestedIssuers(
  db: DbOrTx,
  ctx: Ctx,
  state: string,
): Promise<ParcelDetail['suggestedIssuers']> {
  const rows = await db
    .selectDistinctOn([titleStages.type], {
      type: titleStages.type,
      issuedBy: titleStages.issuedBy,
    })
    .from(titleStages)
    .innerJoin(
      parcels,
      and(
        eq(parcels.organizationId, titleStages.organizationId),
        eq(parcels.id, titleStages.parcelId),
      ),
    )
    .where(and(parcelScope(ctx), eq(parcels.state, state), isNotNull(titleStages.issuedBy)))
    .orderBy(titleStages.type, desc(titleStages.updatedAt))
  return Object.fromEntries(rows.flatMap((r) => (r.issuedBy ? [[r.type, r.issuedBy]] : [])))
}

/**
 * The parcel page: facts, stages, vault, suggestions and what the viewer may do. Outside a
 * transaction the three reads run at once on the pool (runQueries); inside one, in turn.
 */
export async function parcelDetail(db: DbOrTx, ctx: Ctx, id: string): Promise<ParcelDetail> {
  const parcel = await loadParcel(db, ctx, id)
  const [stages, documents, issuers] = await runQueries(db, [
    () => stagesOf(db, ctx, id),
    () => documentsOf(db, ctx.organizationId, { parcelId: id }),
    () => suggestedIssuers(db, ctx, parcel.state),
  ])
  const p = ctx.member.permissions
  const sellerVisible = canSeeCost(ctx.member)
  return {
    ...toParcelRow(ctx, parcel, stages),
    seller: sellerVisible ? parcel.seller : null,
    sellerHidden: !sellerVisible,
    notes: parcel.notes,
    version: parcel.version,
    stages,
    documents: documents.filter((d) => d.latest !== null),
    suggestedIssuers: issuers,
    can: {
      edit: hasPermission(p, 'land', 'edit'),
      create: hasPermission(p, 'land', 'create'),
      delete: hasPermission(p, 'land', 'delete'),
    },
    readOnly: readOnlyReason(parcel),
  }
}
