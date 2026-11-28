import {
  allowsFollowUp,
  type ParcelDetail,
  STAGE_UNDO_SECONDS,
  type TitleStageType,
  type updateStageInput,
} from '@vento/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { auditEvents } from '@/db/schema'
import { badRequest, conflict } from '@/lib/errors'
import { keepUpload } from '@/modules/files/files.records'
import { addVersion, keptVersionCount } from './documents-write'
import { assertNotFuture, assertPermission, assertWritable } from './land-access'
import { parcelDetail } from './parcel-read'
import {
  assertFresh,
  lockStage,
  type StageFields,
  type StageRecord,
  stageFieldsOf,
  stageLabel,
  writeStage,
} from './stage-write'

// Title stage updates (plan §3): any status can follow any other, the sheet never offers
// not_started, and the parcel's status follows the stages in the same transaction. Edit stages
// is in stage-set.service.ts.

function grantedNeedsDocument(type: TitleStageType) {
  return badRequest('granted_needs_document', `Attach the ${stageLabel(type)} to mark it granted.`)
}

/**
 * One stage update from the sheet. Guards: granted needs a vault or attached file of the stage's
 * type; leaving granted needs *What happened*; dates on or before today (Lagos); attaching needs
 * Land & title create; the version must be the one loaded (else CONFLICT `stale` naming who).
 */
export async function updateStage(
  ctx: ServiceContext,
  input: z.output<typeof updateStageInput>,
): Promise<ParcelDetail> {
  if (input.attachments.length > 0) await assertPermission(ctx, 'create', 'upload title documents')
  // Bucket copies before the parcel's lock is taken (keepUpload is idempotent).
  for (const a of input.attachments) await keepUpload(ctx, a.fileId, 'title_document')
  const id = await ctx.db.transaction(async (tx) => {
    const { parcel, stage } = await lockStage(tx, ctx, input.id)
    assertWritable(parcel)
    await assertFresh(tx, ctx, stage, input.expectedVersion)
    // Follow up by is the one date meant for the future, so it isn't checked here.
    assertNotFuture(input.on)
    if (stage.status === 'granted' && input.status !== 'granted' && !input.note) {
      throw badRequest('note_required', `Say what happened to the ${stageLabel(stage.type)}.`)
    }
    for (const a of input.attachments) {
      const evidence = a.type === stage.type
      await addVersion(tx, ctx, parcel, {
        type: a.type,
        name: a.name,
        fileId: a.fileId,
        file: 'kept',
        stage: a.type === 'other' ? { id: stage.id, type: stage.type } : null,
        // The sheet's reference and date become the document's number and issue date.
        ...(evidence && input.status === 'granted'
          ? { number: input.reference, issuedOn: input.on, issuedBy: input.issuedBy }
          : {}),
      })
    }
    if (
      input.status === 'granted' &&
      (await keptVersionCount(tx, ctx.organizationId, parcel.id, stage.type)) === 0
    ) {
      throw grantedNeedsDocument(stage.type)
    }
    await writeStage(
      tx,
      ctx,
      parcel,
      stage,
      {
        status: input.status,
        statusOn: input.on,
        reference: input.reference,
        issuedBy: input.issuedBy,
        note: input.note,
        followUpOn: allowsFollowUp(input.status) ? (input.followUpOn ?? null) : null,
      },
      {},
    )
    return parcel.id
  })
  return parcelDetail(ctx.db, ctx, id)
}

const UNDO_EXPIRED = 'This update can no longer be undone. Update the stage again instead.'

/**
 * Undo in the toast: puts back what the caller's own last update of this stage changed, within
 * 2 minutes and before anyone else touched it. Otherwise CONFLICT `undo_expired`: it's a new
 * update now. A stage granted from Add parcel has no update to undo. Restoring granted still
 * needs its document.
 */
export async function undoStage(
  ctx: ServiceContext,
  input: { id: string; expectedVersion: number },
): Promise<ParcelDetail> {
  return ctx.db.transaction(async (tx) => {
    const { parcel, stage } = await lockStage(tx, ctx, input.id)
    assertWritable(parcel)
    await assertFresh(tx, ctx, stage, input.expectedVersion)
    const last = stage.version > 1 ? await lastStageEvent(tx, ctx, stage) : null
    const fresh = Date.now() - stage.updatedAt.getTime() < STAGE_UNDO_SECONDS * 1000
    if (!last || !fresh || last.undo || stage.updatedByUserId !== ctx.user.id) {
      throw conflict('undo_expired', UNDO_EXPIRED)
    }
    const restored: StageFields = { ...stageFieldsOf(stage), ...last.before }
    if (
      restored.status === 'granted' &&
      (await keptVersionCount(tx, ctx.organizationId, parcel.id, stage.type)) === 0
    ) {
      throw grantedNeedsDocument(stage.type)
    }
    await writeStage(tx, ctx, parcel, stage, restored, { undo: true, undoneStatus: stage.status })
    return parcelDetail(tx, ctx, parcel.id)
  })
}

/** The caller's audit event that produced the stage's current version, if the trail has it. */
async function lastStageEvent(
  tx: DbOrTx,
  ctx: ServiceContext,
  stage: StageRecord,
): Promise<{ before: Partial<StageFields>; undo: boolean } | null> {
  const [row] = await tx
    .select({
      before: auditEvents.before,
      metadata: auditEvents.metadata,
      actor: auditEvents.actorUserId,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.targetType, 'parcel'),
        eq(auditEvents.targetId, stage.parcelId),
        eq(auditEvents.action, 'land.title_stage.updated'),
        sql`${auditEvents.metadata}->>'stageId' = ${stage.id}`,
        sql`(${auditEvents.metadata}->>'version')::int = ${stage.version}`,
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(1)
  if (!row || row.actor !== ctx.user.id) return null
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  if (metadata.fromAdd === true) return null
  return { before: (row.before ?? {}) as Partial<StageFields>, undo: metadata.undo === true }
}
