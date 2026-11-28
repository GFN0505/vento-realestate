import { createHash } from 'node:crypto'
import { documentLabel, type TitleDocumentType } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { attachFile } from '@/modules/files/files.records'
import { incomingKey } from '@/storage'
import type { DbOrTx } from './client'
import { samplePdf, samplePng } from './sample-files'
import { files, titleDocuments, titleDocumentVersions } from './schema'
import type { LandSeedInput } from './seed-land'
import type { ParcelSeed } from './seed-land-data'

// The seed's sample documents: real bytes in the bucket, attached as an upload is.

export type DocSeed = ParcelSeed['documents'][number]

/**
 * The sample file put in the bucket through the storage driver, then attached the way a real
 * upload is (incoming/ copied to kept/). Nothing when the parcel already holds that document.
 */
export async function addSampleDocument(
  tx: DbOrTx,
  input: LandSeedInput,
  parcel: { id: string; name: string },
  doc: DocSeed,
): Promise<{ documentId: string; versionId: string } | null> {
  const name = doc.name ?? null
  const [existing] = await tx
    .select({ id: titleDocuments.id })
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.parcelId, parcel.id),
        eq(titleDocuments.type, doc.type),
        sql`lower(coalesce(${titleDocuments.name}, '')) = lower(${name ?? ''})`,
      ),
    )
  if (existing) return null
  const fileId = await putSampleFile(tx, input, parcel.name, doc.type, name, doc.kind ?? 'pdf')
  const [document] = await tx
    .insert(titleDocuments)
    .values({
      organizationId: input.organizationId,
      parcelId: parcel.id,
      type: doc.type,
      name,
      createdByUserId: input.officer.id,
    })
    .returning({ id: titleDocuments.id })
  if (!document) throw new Error('Seed document did not save')
  const [version] = await tx
    .insert(titleDocumentVersions)
    .values({
      organizationId: input.organizationId,
      documentId: document.id,
      versionNo: 1,
      fileId,
      number: doc.number ?? null,
      uploadedByUserId: input.officer.id,
    })
    .returning({ id: titleDocumentVersions.id })
  if (!version) throw new Error('Seed version did not save')
  return { documentId: document.id, versionId: version.id }
}

const KINDS = {
  pdf: { contentType: 'application/pdf', ext: 'pdf' },
  png: { contentType: 'image/png', ext: 'png' },
} as const

async function putSampleFile(
  tx: DbOrTx,
  input: LandSeedInput,
  parcelName: string,
  type: TitleDocumentType,
  name: string | null,
  kind: keyof typeof KINDS,
): Promise<string> {
  const label = documentLabel(type, name)
  const fileId = await sampleUpload(tx, input, `${parcelName} · ${label}`, label, kind)
  await attachFile(
    tx,
    { organizationId: input.organizationId, user: input.officer, storage: input.storage },
    fileId,
    'title_document',
  )
  return fileId
}

/**
 * A finished upload by the officer, in the bucket's incoming/ and not attached, exactly as
 * `files.completeUpload` leaves one: what the encumbrance services take as evidence.
 */
export async function sampleUpload(
  tx: DbOrTx,
  input: LandSeedInput,
  title: string,
  fileName: string,
  kind: keyof typeof KINDS = 'pdf',
): Promise<string> {
  const bytes = kind === 'pdf' ? samplePdf(title) : samplePng()
  const [idRow] = (await tx.execute<{ id: string }>(sql`select uuidv7() as id`)).rows
  if (!idRow) throw new Error('uuidv7() returned nothing')
  const key = incomingKey(input.organizationId, idRow.id)
  await input.storage.putObject(key, bytes, KINDS[kind].contentType)
  await tx.insert(files).values({
    id: idRow.id,
    organizationId: input.organizationId,
    purpose: 'title_document',
    status: 'ready',
    objectKey: key,
    originalName: `${fileName}.${KINDS[kind].ext}`,
    declaredType: KINDS[kind].contentType,
    contentType: KINDS[kind].contentType,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedByUserId: input.officer.id,
    completedAt: new Date(),
  })
  return idRow.id
}
