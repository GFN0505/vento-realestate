import {
  type DocumentVersion,
  TITLE_DOCUMENT_TYPES,
  TITLE_DOCUMENTS,
  type TitleDocument,
  type TitleStageType,
} from '@vento/shared'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { DbOrTx } from '@/db/client'
import { files, titleDocuments, titleDocumentVersions, titleStages, users } from '@/db/schema'

// How the document vault reads: documents with their versions, batched by document ids. Callers
// have already checked the parcel is in scope.

const removedBy = alias(users, 'removed_by')

/** Versions of these documents, newest first, with file facts and names. */
export async function versionsOf(
  db: DbOrTx,
  organizationId: string,
  documentIds: string[],
): Promise<Map<string, DocumentVersion[]>> {
  const byDocument = new Map<string, DocumentVersion[]>()
  if (documentIds.length === 0) return byDocument
  const rows = await db
    .select({
      id: titleDocumentVersions.id,
      documentId: titleDocumentVersions.documentId,
      versionNo: titleDocumentVersions.versionNo,
      number: titleDocumentVersions.number,
      issuedOn: titleDocumentVersions.issuedOn,
      issuedBy: titleDocumentVersions.issuedBy,
      note: titleDocumentVersions.note,
      uploadedAt: titleDocumentVersions.createdAt,
      uploadedByName: users.name,
      fileName: files.originalName,
      contentType: files.contentType,
      sizeBytes: files.sizeBytes,
      removedAt: titleDocumentVersions.removedAt,
      removedReason: titleDocumentVersions.removedReason,
      removedByName: removedBy.name,
    })
    .from(titleDocumentVersions)
    .innerJoin(users, eq(users.id, titleDocumentVersions.uploadedByUserId))
    .innerJoin(
      files,
      and(
        eq(files.organizationId, titleDocumentVersions.organizationId),
        eq(files.id, titleDocumentVersions.fileId),
      ),
    )
    .leftJoin(removedBy, eq(removedBy.id, titleDocumentVersions.removedByUserId))
    .where(
      and(
        eq(titleDocumentVersions.organizationId, organizationId),
        inArray(titleDocumentVersions.documentId, documentIds),
      ),
    )
    .orderBy(desc(titleDocumentVersions.versionNo))
  for (const r of rows) {
    const version: DocumentVersion = {
      id: r.id,
      versionNo: r.versionNo,
      number: r.number,
      issuedOn: r.issuedOn,
      issuedBy: r.issuedBy,
      note: r.note,
      uploadedAt: r.uploadedAt.toISOString(),
      uploadedBy: { name: r.uploadedByName },
      file: { name: r.fileName, contentType: r.contentType ?? '', sizeBytes: r.sizeBytes },
      removed:
        r.removedAt && r.removedReason
          ? {
              at: r.removedAt.toISOString(),
              byName: r.removedByName ?? 'Someone',
              reason: r.removedReason,
            }
          : null,
    }
    byDocument.set(r.documentId, [...(byDocument.get(r.documentId) ?? []), version])
  }
  return byDocument
}

type DocumentRow = {
  id: string
  type: TitleDocument['type']
  name: string | null
  stageType: TitleStageType | null
}

export function toTitleDocument(
  doc: DocumentRow,
  versions: readonly DocumentVersion[],
): TitleDocument {
  const kept = versions.filter((v) => !v.removed)
  return {
    id: doc.id,
    type: doc.type,
    name: doc.name,
    stageType: doc.stageType ?? TITLE_DOCUMENTS[doc.type].stageType,
    latest: kept[0] ?? null,
    earlierCount: Math.max(0, kept.length - 1),
  }
}

/** Documents of a parcel (or one document), with the stage an `other` file sits under. */
export async function documentsOf(
  db: DbOrTx,
  organizationId: string,
  where: { parcelId: string } | { documentId: string },
): Promise<TitleDocument[]> {
  const docs = await db
    .select({
      id: titleDocuments.id,
      type: titleDocuments.type,
      name: titleDocuments.name,
      stageType: titleStages.type,
    })
    .from(titleDocuments)
    .leftJoin(
      titleStages,
      and(
        eq(titleStages.organizationId, titleDocuments.organizationId),
        eq(titleStages.id, titleDocuments.stageId),
      ),
    )
    .where(
      and(
        eq(titleDocuments.organizationId, organizationId),
        'parcelId' in where
          ? eq(titleDocuments.parcelId, where.parcelId)
          : eq(titleDocuments.id, where.documentId),
      ),
    )
    .orderBy(asc(sql`lower(coalesce(${titleDocuments.name}, ''))`))
  const versions = await versionsOf(
    db,
    organizationId,
    docs.map((d) => d.id),
  )
  return docs
    .map((d) => toTitleDocument(d, versions.get(d.id) ?? []))
    .sort((a, b) => TITLE_DOCUMENT_TYPES.indexOf(a.type) - TITLE_DOCUMENT_TYPES.indexOf(b.type))
}
