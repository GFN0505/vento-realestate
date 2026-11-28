import { TITLE_DOCUMENTS, type TitleDocumentType, type TitleStageType } from '@vento/shared'
import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { parcels, titleDocuments, titleDocumentVersions } from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import { attachFile } from '@/modules/files/files.records'
import { type ParcelRecord, parcelScope, parcelTarget } from './land-access'

// Adding a file to a parcel's vault: the one writer behind Add parcel, Upload document and the
// stage sheet's attachments. The caller holds the parcel's lock.

export type NewVersion = {
  type: TitleDocumentType
  name: string | null
  fileId: string
  number?: string | null
  issuedOn?: string | null
  issuedBy?: string | null
  note?: string | null
  /** An `other` file attached in a stage sheet sits under that stage. */
  stage?: { id: string; type: TitleStageType } | null
  /** **Add as a separate document**: a name already used on this type is refused. */
  separate?: boolean
  /**
   * Where the file is: `incoming` (copied to `kept/` here), `kept` (keepUpload ran before the
   * transaction) or `attached` (attachFile already ran in this transaction).
   */
  file?: 'incoming' | 'kept' | 'attached'
}

/**
 * Documents a parcel may hold (review: an unbounded vault). Versions of one aren't counted, nor
 * encumbrance evidence (review #7): a full vault must never stop someone recording a court order
 * or asking to clear one, and those come two per encumbrance, created only by its sheets.
 */
export const MAX_DOCUMENTS_PER_PARCEL = 200

export type AddedVersion = {
  documentId: string
  versionId: string
  versionNo: number
}

/**
 * A same-type upload (for named types, the same name, any case) finds the existing document and
 * becomes its next version; otherwise a new document. Version numbers are allocated under the
 * document row's lock. The file is attached in this transaction (decision 0025); a file that
 * isn't the caller's finished, unused upload is BAD_REQUEST `file_unavailable`.
 */
export async function addVersion(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: Pick<ParcelRecord, 'id' | 'name' | 'entityId'>,
  input: NewVersion,
): Promise<AddedVersion> {
  const name = input.name?.trim() || null
  const documentId = await findOrCreateDocument(tx, ctx, parcel.id, { ...input, name })
  const [last] = await tx
    .select({ n: sql<number>`coalesce(max(${titleDocumentVersions.versionNo}), 0)::int` })
    .from(titleDocumentVersions)
    .where(
      and(
        eq(titleDocumentVersions.organizationId, ctx.organizationId),
        eq(titleDocumentVersions.documentId, documentId),
      ),
    )
  const versionNo = (last?.n ?? 0) + 1
  const file = input.file ?? 'incoming'
  if (file !== 'attached') {
    await attachFile(tx, ctx, input.fileId, 'title_document', { kept: file === 'kept' })
  }
  const [version] = await tx
    .insert(titleDocumentVersions)
    .values({
      organizationId: ctx.organizationId,
      documentId,
      versionNo,
      fileId: input.fileId,
      number: input.number ?? null,
      issuedOn: input.issuedOn ?? null,
      issuedBy: input.issuedBy ?? null,
      note: input.note ?? null,
      uploadedByUserId: ctx.user.id,
    })
    .returning({ id: titleDocumentVersions.id })
  if (!version) throw new Error('title_document_versions insert returned nothing')
  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    action: 'land.document.uploaded',
    actor: actorOf(ctx),
    target: parcelTarget(parcel),
    after: {
      ...(input.number && { number: input.number }),
      ...(input.issuedOn && { issuedOn: input.issuedOn }),
      ...(input.issuedBy && { issuedBy: input.issuedBy }),
    },
    // Ids only: the document's name is read from title_documents when the event is shown.
    metadata: {
      entityId: parcel.entityId,
      documentId,
      documentType: input.type,
      versionId: version.id,
      versionNo,
      stageType: TITLE_DOCUMENTS[input.type].stageType ?? input.stage?.type ?? null,
      // An `other` file attached in a stage sheet: which stage it now sits under.
      ...(input.type === 'other' && input.stage && { stageId: input.stage.id }),
    },
  })
  return { documentId, versionId: version.id, versionNo }
}

async function findOrCreateDocument(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcelId: string,
  input: NewVersion & { name: string | null },
): Promise<string> {
  const [existing] = await tx
    .select({ id: titleDocuments.id, name: titleDocuments.name, stageId: titleDocuments.stageId })
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.organizationId, ctx.organizationId),
        eq(titleDocuments.parcelId, parcelId),
        eq(titleDocuments.type, input.type),
        sql`lower(coalesce(${titleDocuments.name}, '')) = lower(${input.name ?? ''})`,
      ),
    )
    .for('update')
  if (existing && input.separate) {
    throw conflict(
      'document_name_taken',
      `There's already a ${TITLE_DOCUMENTS[input.type].word} called ${existing.name ?? input.name}. Use another name or upload it as a new version.`,
    )
  }
  if (existing) {
    if (input.type === 'other' && input.stage && !existing.stageId) {
      await tx
        .update(titleDocuments)
        .set({ stageId: input.stage.id })
        .where(
          and(
            eq(titleDocuments.organizationId, ctx.organizationId),
            eq(titleDocuments.id, existing.id),
            isNull(titleDocuments.stageId),
          ),
        )
    }
    return existing.id
  }
  if (input.type !== 'encumbrance_evidence') await refuseFullVault(tx, ctx.organizationId, parcelId)
  const [created] = await tx
    .insert(titleDocuments)
    .values({
      organizationId: ctx.organizationId,
      parcelId,
      type: input.type,
      name: input.name,
      stageId: input.type === 'other' ? (input.stage?.id ?? null) : null,
      createdByUserId: ctx.user.id,
    })
    .returning({ id: titleDocuments.id })
  if (!created) throw new Error('title_documents insert returned nothing')
  return created.id
}

async function refuseFullVault(tx: DbOrTx, organizationId: string, parcelId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.organizationId, organizationId),
        eq(titleDocuments.parcelId, parcelId),
        ne(titleDocuments.type, 'encumbrance_evidence'),
      ),
    )
  if ((row?.n ?? 0) < MAX_DOCUMENTS_PER_PARCEL) return
  throw conflict(
    'too_many_documents',
    `This parcel already holds ${MAX_DOCUMENTS_PER_PARCEL} documents. Upload this file as a new version of one of them.`,
  )
}

/** Versions in the vault (not removed) of this type on the parcel, maybe leaving one out. */
export async function keptVersionCount(
  tx: DbOrTx,
  organizationId: string,
  parcelId: string,
  type: TitleDocumentType,
  exceptVersionId?: string,
): Promise<number> {
  const result = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n
    from title_document_versions v
    join title_documents d on d.organization_id = v.organization_id and d.id = v.document_id
    where v.organization_id = ${organizationId} and d.parcel_id = ${parcelId}
      and d.type = ${type} and v.removed_at is null
      ${exceptVersionId ? sql`and v.id <> ${exceptVersionId}` : sql``}
  `)
  return result.rows[0]?.n ?? 0
}

export type VersionRecord = {
  versionId: string
  versionNo: number
  fileId: string
  removedAt: Date | null
  documentId: string
  type: TitleDocumentType
  name: string | null
  parcelId: string
}

/** A version whose parcel is in scope, or NOT_FOUND. */
export async function loadVersion(
  db: DbOrTx,
  ctx: ServiceContext,
  versionId: string,
): Promise<VersionRecord> {
  const [row] = await db
    .select({
      versionId: titleDocumentVersions.id,
      versionNo: titleDocumentVersions.versionNo,
      fileId: titleDocumentVersions.fileId,
      removedAt: titleDocumentVersions.removedAt,
      documentId: titleDocuments.id,
      type: titleDocuments.type,
      name: titleDocuments.name,
      parcelId: parcels.id,
    })
    .from(titleDocumentVersions)
    .innerJoin(
      titleDocuments,
      and(
        eq(titleDocuments.organizationId, titleDocumentVersions.organizationId),
        eq(titleDocuments.id, titleDocumentVersions.documentId),
      ),
    )
    .innerJoin(
      parcels,
      and(
        eq(parcels.organizationId, titleDocuments.organizationId),
        eq(parcels.id, titleDocuments.parcelId),
      ),
    )
    .where(and(parcelScope(ctx), eq(titleDocumentVersions.id, versionId)))
  if (!row) throw notFound()
  return row
}

export function versionMetadata(parcel: ParcelRecord, v: VersionRecord) {
  return {
    entityId: parcel.entityId,
    documentId: v.documentId,
    documentType: v.type,
    versionId: v.versionId,
    versionNo: v.versionNo,
    stageType: TITLE_DOCUMENTS[v.type].stageType,
  }
}
