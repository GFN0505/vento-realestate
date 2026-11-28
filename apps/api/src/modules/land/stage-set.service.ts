import type { ParcelDetail, setStagesInput, TitleStageStatus, TitleStageType } from '@vento/shared'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { parcels, titleDocuments, titleStages } from '@/db/schema'
import { conflict } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import {
  assertWritable,
  lastChangedBy,
  loadParcel,
  parcelTarget,
  staleConflict,
} from './land-access'
import { parcelDetail } from './parcel-read'
import { followStages, stageLabel } from './stage-write'

// Edit stages (plan §3): the parcel's whole list. At least one stays (the input says so).

/**
 * New stages start not started; a stage that has started or holds documents stays (CONFLICT
 * `stage_started`). Bumps the parcel's version; adding a stage to a titled parcel takes it back
 * to acquired, removing the last ungranted one titles it.
 */
export async function setStages(
  ctx: ServiceContext,
  input: z.output<typeof setStagesInput>,
): Promise<ParcelDetail> {
  return ctx.db.transaction(async (tx) => {
    const parcel = await loadParcel(tx, ctx, input.parcelId, { lock: true })
    assertWritable(parcel)
    if (parcel.version !== input.expectedVersion) {
      throw staleConflict(await lastChangedBy(tx, ctx.organizationId, parcel.id), 'parcel')
    }
    const current = await tx
      .select({ id: titleStages.id, type: titleStages.type, status: titleStages.status })
      .from(titleStages)
      .where(
        and(
          eq(titleStages.organizationId, ctx.organizationId),
          eq(titleStages.parcelId, parcel.id),
        ),
      )
    const added = input.types.filter((t) => !current.some((s) => s.type === t))
    const removed = current.filter((s) => !input.types.includes(s.type))
    if (added.length === 0 && removed.length === 0) return parcelDetail(tx, ctx, parcel.id)
    await refuseStartedRemovals(tx, ctx, parcel.id, removed)
    if (removed.length) {
      await tx.delete(titleStages).where(
        and(
          eq(titleStages.organizationId, ctx.organizationId),
          inArray(
            titleStages.id,
            removed.map((s) => s.id),
          ),
        ),
      )
    }
    if (added.length) {
      await tx.insert(titleStages).values(
        added.map((type) => ({
          organizationId: ctx.organizationId,
          parcelId: parcel.id,
          type,
          updatedByUserId: ctx.user.id,
        })),
      )
    }
    await tx
      .update(parcels)
      .set({ version: sql`${parcels.version} + 1` })
      .where(and(eq(parcels.organizationId, ctx.organizationId), eq(parcels.id, parcel.id)))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.title_stages.changed',
      actor: actorOf(ctx),
      target: parcelTarget(parcel),
      before: { stages: current.map((s) => stageLabel(s.type)).join(', ') },
      after: { stages: input.types.map(stageLabel).join(', ') },
      metadata: { entityId: parcel.entityId, added, removed: removed.map((s) => s.type) },
    })
    await followStages(tx, ctx, parcel)
    return parcelDetail(tx, ctx, parcel.id)
  })
}

async function refuseStartedRemovals(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcelId: string,
  removed: { id: string; type: TitleStageType; status: TitleStageStatus }[],
): Promise<void> {
  if (removed.length === 0) return
  const started = removed.find((s) => s.status !== 'not_started')
  const documented = started
    ? []
    : await tx
        .select({
          type: titleDocuments.type,
          stageId: titleDocuments.stageId,
          // Every version removed: no document in the vault, but history that keeps the stage.
          // Columns nested in sql`` stay table-qualified in a single-table select.
          inVault: sql<boolean>`exists (select 1 from title_document_versions v
            where v.organization_id = ${sql`${titleDocuments.organizationId}`}
              and v.document_id = ${sql`${titleDocuments.id}`} and v.removed_at is null)`,
        })
        .from(titleDocuments)
        .where(
          and(
            eq(titleDocuments.organizationId, ctx.organizationId),
            eq(titleDocuments.parcelId, parcelId),
            or(
              inArray(
                titleDocuments.type,
                removed.map((s) => s.type),
              ),
              inArray(
                titleDocuments.stageId,
                removed.map((s) => s.id),
              ),
            ),
          ),
        )
  const docsOf = (s: { id: string; type: TitleStageType }) =>
    documented.filter((d) => d.type === s.type || d.stageId === s.id)
  const stuck = started ?? removed.find((s) => docsOf(s).length > 0)
  if (!stuck) return
  const label = stageLabel(stuck.type)
  if (stuck.status !== 'not_started') {
    throw conflict('stage_started', `${label} has started, so it stays.`)
  }
  throw conflict(
    'stage_started',
    docsOf(stuck).some((d) => d.inVault)
      ? `${label} has documents, so it stays.`
      : `${label} has document history, so it stays.`,
  )
}
