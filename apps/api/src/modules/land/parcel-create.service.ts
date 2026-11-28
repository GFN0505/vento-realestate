import {
  type createParcelInput,
  defaultStagesFor,
  type ParcelDetail,
  plotSizeFor,
  sizeText,
  TITLE_DOCUMENTS,
  type TitleStageType,
  toSqm,
} from '@vento/shared'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { parcels, titleStages } from '@/db/schema'
import { nextNumber } from '@/lib/counters'
import { recordAudit } from '@/modules/audit/audit.service'
import { attachFile, keepUpload } from '@/modules/files/files.records'
import { addVersion } from './documents-write'
import { assertNotFuture, loadActiveEntity, parcelTarget, sellerWords } from './land-access'
import { parcelDetail } from './parcel-read'
import { followStages, stageLabel } from './stage-write'

// Add parcel (plan §3, §4): the parcel, its stages and its documents in one transaction.

type CreateInput = z.output<typeof createParcelInput>

/** The stored size columns for an entry. */
export function sizeColumns(size: CreateInput['size']) {
  return {
    sizeSqm: toSqm(size),
    sizeUnit: size.unit,
    sizeEntered: size.value,
    plotSizeSqm: plotSizeFor(size),
  }
}

/**
 * Add parcel, all in one transaction: the next reference, the parcel, its stages (the state's
 * defaults unless picked), its documents (attached files), and the audit trail. A stage whose
 * document was uploaded here starts granted, dated with the document's issue date when typed
 * (owner, 28 Nov 2026); receipts, agreements and other documents grant nothing. Acquired with
 * every stage granted opens as titled.
 *
 * The organization's counter row stays locked until commit, so every other create waits on it:
 * the bucket copies run before the transaction, the files are attached before the number is
 * taken, and the detail is read after commit (review: a slow copy blocked every create).
 */
export async function createParcel(ctx: ServiceContext, input: CreateInput): Promise<ParcelDetail> {
  assertNotFuture(input.acquiredOn)
  for (const d of input.documents) assertNotFuture(d.issuedOn)
  for (const d of input.documents) await keepUpload(ctx, d.fileId, 'title_document')
  const stages = input.stages ?? defaultStagesFor(input.state)
  const id = await ctx.db.transaction(async (tx) => {
    const entity = await loadActiveEntity(tx, ctx, input.entityId)
    for (const d of input.documents) {
      await attachFile(tx, ctx, d.fileId, 'title_document', { kept: true })
    }
    const referenceNumber = await nextNumber(tx, ctx.organizationId, 'parcel')
    const size = sizeColumns(input.size)
    const [created] = await tx
      .insert(parcels)
      .values({
        organizationId: ctx.organizationId,
        entityId: entity.id,
        referenceNumber,
        name: input.name,
        state: input.state,
        lga: input.lga,
        area: input.area,
        ...size,
        status: input.status,
        acquiredOn: input.acquiredOn ?? null,
        acquisitionCost: input.acquisitionCost ?? null,
        seller: input.seller,
        notes: input.notes,
      })
      .returning({ id: parcels.id })
    if (!created) throw new Error('parcels insert returned nothing')
    const parcel = { id: created.id, name: input.name, entityId: entity.id, status: input.status }
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.parcel.created',
      actor: actorOf(ctx),
      target: parcelTarget(parcel),
      // The company is metadata.entityId (named when read); the seller is never written here.
      after: {
        name: input.name,
        state: input.state,
        lga: input.lga,
        area: input.area,
        size: sizeText({ ...size, sizeUnit: size.sizeUnit }),
        status: input.status,
        stages: stages.map(stageLabel).join(', '),
        acquiredOn: input.acquiredOn ?? null,
        acquisitionCost: input.acquisitionCost ?? null,
        seller: sellerWords(null, input.seller),
      },
      metadata: { entityId: entity.id, referenceNumber },
    })
    for (const d of input.documents) {
      await addVersion(tx, ctx, parcel, {
        type: d.type,
        name: d.name,
        fileId: d.fileId,
        file: 'attached',
        number: d.number,
        issuedOn: d.issuedOn ?? null,
        issuedBy: d.issuedBy,
      })
    }
    await createStages(tx, ctx, parcel, stages, input)
    await followStages(tx, ctx, parcel)
    return created.id
  })
  return parcelDetail(ctx.db, ctx, id)
}

/** A stage with its document among the uploads is granted at once, with an audited fromAdd. */
async function createStages(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: { id: string; name: string; entityId: string },
  types: TitleStageType[],
  input: Pick<CreateInput, 'documents'>,
): Promise<void> {
  const evidence = (type: TitleStageType) =>
    input.documents.find((d) => TITLE_DOCUMENTS[d.type].stageType === type)
  const rows = types.map((type) => {
    const doc = evidence(type)
    return {
      organizationId: ctx.organizationId,
      parcelId: parcel.id,
      type,
      status: doc ? ('granted' as const) : ('not_started' as const),
      statusOn: doc?.issuedOn ?? null,
      reference: doc?.number ?? null,
      issuedBy: doc?.issuedBy ?? null,
      updatedByUserId: ctx.user.id,
    }
  })
  const inserted = await tx
    .insert(titleStages)
    .values(rows)
    .returning({ id: titleStages.id, type: titleStages.type, status: titleStages.status })
  for (const stage of inserted.filter((s) => s.status === 'granted')) {
    const row = rows.find((r) => r.type === stage.type)
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.title_stage.updated',
      actor: actorOf(ctx),
      target: parcelTarget(parcel),
      before: { status: 'not_started' },
      after: {
        status: 'granted',
        ...(row?.statusOn && { statusOn: row.statusOn }),
        ...(row?.reference && { reference: row.reference }),
      },
      metadata: {
        entityId: parcel.entityId,
        stageId: stage.id,
        stageType: stage.type,
        status: 'granted',
        version: 1,
        fromAdd: true,
      },
    })
  }
}
