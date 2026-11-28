import {
  resolveParcelStatus,
  TITLE_STAGE_LABELS,
  type TitleStageStatus,
  type TitleStageType,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { parcels, titleStages, users } from '@/db/schema'
import { notFound } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import { actorFor, actorStandingOf } from '@/modules/audit/audit-read.service'
import { loadParcel, type ParcelRecord, parcelTarget, staleConflict } from './land-access'

// The one writer of a title stage (the sheet, Undo), and the parcel status that follows the
// stages (plan §3). Every caller holds the parcel's lock, then the stage's.

export const STAGE_FIELDS = [
  'status',
  'statusOn',
  'reference',
  'issuedBy',
  'note',
  'followUpOn',
] as const

export type StageFields = {
  status: TitleStageStatus
  statusOn: string | null
  reference: string | null
  issuedBy: string | null
  note: string | null
  followUpOn: string | null
}

export type StageRecord = StageFields & {
  id: string
  parcelId: string
  type: TitleStageType
  version: number
  updatedByUserId: string | null
  updatedAt: Date
}

const stageColumns = {
  id: titleStages.id,
  parcelId: titleStages.parcelId,
  type: titleStages.type,
  status: titleStages.status,
  statusOn: titleStages.statusOn,
  reference: titleStages.reference,
  issuedBy: titleStages.issuedBy,
  note: titleStages.note,
  followUpOn: titleStages.followUpOn,
  version: titleStages.version,
  updatedByUserId: titleStages.updatedByUserId,
  updatedAt: titleStages.updatedAt,
}

export const stageLabel = (type: TitleStageType): string => TITLE_STAGE_LABELS[type]

/** The stage and its parcel, both locked (parcel first), or NOT_FOUND outside scope. */
export async function lockStage(
  tx: DbOrTx,
  ctx: ServiceContext,
  stageId: string,
): Promise<{ parcel: ParcelRecord; stage: StageRecord }> {
  const [found] = await tx
    .select({ parcelId: titleStages.parcelId })
    .from(titleStages)
    .where(and(eq(titleStages.organizationId, ctx.organizationId), eq(titleStages.id, stageId)))
  if (!found) throw notFound()
  // Scope is the parcel's: a stage on a parcel outside the member's companies is missing.
  const parcel = await loadParcel(tx, ctx, found.parcelId, { lock: true })
  const [stage] = await tx
    .select(stageColumns)
    .from(titleStages)
    .where(and(eq(titleStages.organizationId, ctx.organizationId), eq(titleStages.id, stageId)))
    .for('update')
  if (!stage) throw notFound()
  return { parcel, stage }
}

/**
 * CONFLICT `stale` naming who saved the stage since the sheet loaded it, as the audit log names
 * them (someone outside the organization isn't).
 */
export async function assertFresh(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId'>,
  stage: StageRecord,
  expectedVersion: number,
): Promise<void> {
  if (stage.version === expectedVersion) return
  const userId = stage.updatedByUserId
  const [by] = userId
    ? await tx
        .select({
          actorUserId: users.id,
          actorName: users.name,
          actorStanding: actorStandingOf(users.id, sql`${ctx.organizationId}::uuid`),
        })
        .from(users)
        .where(eq(users.id, userId))
    : []
  throw staleConflict(by ? actorFor(by).name : 'Someone', 'stage')
}

export const stageFieldsOf = (s: StageRecord): StageFields =>
  Object.fromEntries(STAGE_FIELDS.map((k) => [k, s[k]])) as StageFields

/** Writes the stage, audits what changed, then lets the parcel's status follow. */
export async function writeStage(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: ParcelRecord,
  stage: StageRecord,
  next: StageFields,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx
    .update(titleStages)
    .set({ ...next, version: sql`${titleStages.version} + 1`, updatedByUserId: ctx.user.id })
    .where(
      and(
        eq(titleStages.organizationId, ctx.organizationId),
        eq(titleStages.id, stage.id),
        eq(titleStages.version, stage.version),
      ),
    )
  const changed = STAGE_FIELDS.filter((k) => next[k] !== stage[k])
  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    action: 'land.title_stage.updated',
    actor: actorOf(ctx),
    target: parcelTarget(parcel),
    before: Object.fromEntries(changed.map((k) => [k, stage[k]])),
    after: Object.fromEntries(changed.map((k) => [k, next[k]])),
    metadata: {
      entityId: parcel.entityId,
      stageId: stage.id,
      stageType: stage.type,
      status: next.status,
      // The stage's version after this write: Undo finds the event that made the current one.
      version: stage.version + 1,
      ...metadata,
    },
  })
  await followStages(tx, ctx, parcel)
}

/**
 * The parcel's status after its stages changed: acquired ⇄ titled, automatically, with its own
 * audit event. Bumps the parcel's version only when the status moves.
 */
export async function followStages(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: Pick<ParcelRecord, 'id' | 'name' | 'entityId' | 'status'>,
): Promise<void> {
  const stages = await tx
    .select({ status: titleStages.status })
    .from(titleStages)
    .where(
      and(eq(titleStages.organizationId, ctx.organizationId), eq(titleStages.parcelId, parcel.id)),
    )
  const next = resolveParcelStatus(parcel.status, stages)
  const thisParcel = and(eq(parcels.organizationId, ctx.organizationId), eq(parcels.id, parcel.id))
  if (next === parcel.status) {
    // The list sorts by "Updated"; a stage change moves it without a new parcel version.
    await tx.update(parcels).set({ updatedAt: new Date() }).where(thisParcel)
    return
  }
  await tx
    .update(parcels)
    .set({ status: next, version: sql`${parcels.version} + 1` })
    .where(thisParcel)
  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    action: 'land.parcel.updated',
    actor: actorOf(ctx),
    target: parcelTarget(parcel),
    before: { status: parcel.status },
    after: { status: next },
    metadata: { entityId: parcel.entityId, automatic: next },
  })
}
