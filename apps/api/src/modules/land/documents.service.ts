import {
  type DocumentVersion,
  type removeVersionInput,
  TITLE_DOCUMENTS,
  TITLE_STAGE_LABELS,
  type TitleDocument,
  type uploadDocumentInput,
} from '@vento/shared'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { parcels, titleDocuments, titleDocumentVersions, titleStages } from '@/db/schema'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import { keepUpload } from '@/modules/files/files.records'
import { documentsOf } from './document-read'
import {
  addVersion,
  keptVersionCount,
  loadVersion,
  type VersionRecord,
  versionMetadata,
} from './documents-write'
import {
  assertAcceptsVersion,
  assertDocumentVisible,
  refuseIfPinned,
} from './encumbrance-documents'
import {
  assertNotFuture,
  assertWritable,
  loadParcel,
  type ParcelRecord,
  parcelTarget,
} from './land-access'
import { canSeeEncumbranceDetails } from './land-visibility'

// The document vault (spec "Document vault"): uploads become versions, a version is removed only
// with a reason (and Undo). Reading and links are in document-link.service.ts.

/** Upload document: never grants a stage by itself (the stage sheet does that). */
export async function uploadDocument(
  ctx: ServiceContext,
  input: z.output<typeof uploadDocumentInput>,
): Promise<{ document: TitleDocument; version: DocumentVersion }> {
  assertNotFuture(input.issuedOn)
  // The bucket copy runs before the parcel's lock is taken (keepUpload is idempotent).
  await keepUpload(ctx, input.fileId, 'title_document')
  return ctx.db.transaction(async (tx) => {
    const parcel = await loadParcel(tx, ctx, input.parcelId, { lock: true })
    assertWritable(parcel)
    if (input.type === 'encumbrance_evidence') {
      const documentId = await assertEvidenceExists(tx, ctx, parcel, input)
      await assertAcceptsVersion(tx, ctx, documentId)
    }
    const added = await addVersion(tx, ctx, parcel, {
      type: input.type,
      name: input.name,
      separate: input.separate,
      fileId: input.fileId,
      file: 'kept',
      number: input.number,
      issuedOn: input.issuedOn ?? null,
      issuedBy: input.issuedBy,
      note: input.note,
    })
    await touchParcel(tx, ctx, parcel.id)
    const [document] = await documentsOf(tx, ctx.organizationId, { documentId: added.documentId })
    const version = document?.latest
    if (!document || !version) throw new Error('The uploaded version did not read back')
    return { document, version }
  })
}

/**
 * Remove with a reason: hidden from the vault, kept (with its file) in the history. The only
 * file behind a granted stage stays: CONFLICT `evidence_for_granted`.
 */
export async function removeVersion(
  ctx: ServiceContext,
  input: z.output<typeof removeVersionInput>,
): Promise<{ document: TitleDocument }> {
  return ctx.db.transaction(async (tx) => {
    const found = await loadVersion(tx, ctx, input.versionId)
    assertDocumentVisible(ctx, found.type)
    const parcel = await loadParcel(tx, ctx, found.parcelId, { lock: true })
    assertWritable(parcel)
    const v = await loadVersion(tx, ctx, input.versionId)
    if (!v.removedAt) {
      await refuseIfLastEvidence(tx, ctx, parcel, v)
      if (v.type === 'encumbrance_evidence') await refuseIfPinned(tx, ctx, v.versionId)
      await tx
        .update(titleDocumentVersions)
        .set({ removedAt: new Date(), removedByUserId: ctx.user.id, removedReason: input.reason })
        .where(
          and(
            eq(titleDocumentVersions.organizationId, ctx.organizationId),
            eq(titleDocumentVersions.id, v.versionId),
            isNull(titleDocumentVersions.removedAt),
          ),
        )
      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        action: 'land.document.removed',
        actor: actorOf(ctx),
        target: parcelTarget(parcel),
        metadata: { ...versionMetadata(parcel, v), reason: input.reason },
      })
      await touchParcel(tx, ctx, parcel.id)
    }
    return { document: await readDocument(tx, ctx, v.documentId) }
  })
}

async function refuseIfLastEvidence(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: ParcelRecord,
  v: VersionRecord,
): Promise<void> {
  const stageType = TITLE_DOCUMENTS[v.type].stageType
  if (!stageType) return
  const [stage] = await tx
    .select({ status: titleStages.status })
    .from(titleStages)
    .where(
      and(
        eq(titleStages.organizationId, ctx.organizationId),
        eq(titleStages.parcelId, parcel.id),
        eq(titleStages.type, stageType),
      ),
    )
  if (stage?.status !== 'granted') return
  if ((await keptVersionCount(tx, ctx.organizationId, parcel.id, v.type, v.versionId)) > 0) return
  throw conflict(
    'evidence_for_granted',
    `This is the evidence for the granted ${TITLE_STAGE_LABELS[stageType]}. Upload the right file first.`,
  )
}

/**
 * An encumbrance's evidence and clearance documents are created by the encumbrance sheets (named
 * after it); the vault only adds a better scan as a new version of one that exists, and only for
 * people who can see encumbrance details. Returns that document.
 */
async function assertEvidenceExists(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: ParcelRecord,
  input: Pick<z.output<typeof uploadDocumentInput>, 'name' | 'separate'>,
): Promise<string> {
  const refusal = badRequest('evidence_from_encumbrance', 'Add evidence from the encumbrance.')
  if (input.separate || !input.name || !canSeeEncumbranceDetails(ctx.member)) throw refusal
  const [found] = await tx
    .select({ id: titleDocuments.id })
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.organizationId, ctx.organizationId),
        eq(titleDocuments.parcelId, parcel.id),
        eq(titleDocuments.type, 'encumbrance_evidence'),
        sql`lower(${titleDocuments.name}) = lower(${input.name})`,
      ),
    )
  if (!found) throw refusal
  return found.id
}

/** Undo of a remove: back in the vault. A version that isn't removed is returned as it is. */
export async function restoreVersion(
  ctx: ServiceContext,
  versionId: string,
): Promise<{ document: TitleDocument }> {
  return ctx.db.transaction(async (tx) => {
    const found = await loadVersion(tx, ctx, versionId)
    assertDocumentVisible(ctx, found.type)
    const parcel = await loadParcel(tx, ctx, found.parcelId, { lock: true })
    assertWritable(parcel)
    const [restored] = await tx
      .update(titleDocumentVersions)
      .set({ removedAt: null, removedByUserId: null, removedReason: null })
      .where(
        and(
          eq(titleDocumentVersions.organizationId, ctx.organizationId),
          eq(titleDocumentVersions.id, versionId),
          isNotNull(titleDocumentVersions.removedAt),
        ),
      )
      .returning({ id: titleDocumentVersions.id })
    if (restored) {
      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        action: 'land.document.restored',
        actor: actorOf(ctx),
        target: parcelTarget(parcel),
        metadata: versionMetadata(parcel, found),
      })
      await touchParcel(tx, ctx, parcel.id)
    }
    return { document: await readDocument(tx, ctx, found.documentId) }
  })
}

async function readDocument(db: DbOrTx, ctx: ServiceContext, documentId: string) {
  const [document] = await documentsOf(db, ctx.organizationId, { documentId })
  if (!document) throw notFound()
  return document
}

/** A vault change moves the parcel's "Updated" (the list sorts by it); its version stays. */
export async function touchParcel(tx: DbOrTx, ctx: ServiceContext, parcelId: string) {
  await tx
    .update(parcels)
    .set({ updatedAt: new Date() })
    .where(and(eq(parcels.organizationId, ctx.organizationId), eq(parcels.id, parcelId)))
}
