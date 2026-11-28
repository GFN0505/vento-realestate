import { DOWNLOAD_URL_SECONDS, FILE_KINDS, type FilePurpose } from '@vento/shared'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { badRequest, notFound } from '@/lib/errors'
import { keptKey, type Storage, StorageError } from '@/storage'
import { inSeconds } from './files.service'

// The API for modules that hold files (land documents first; receipts, photos, KYC later),
// decision 0025: attach a finished upload to a record, and sign a link to read it back.

const FILE_UNAVAILABLE = 'This file is no longer available. Upload it again.'

export type AttachedFile = {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  sha256: string
}

/** The caller's finished, unattached upload for this purpose; anything else is missing. */
const attachable = (
  ctx: Pick<ServiceContext, 'organizationId' | 'user'>,
  fileId: string,
  purpose: FilePurpose,
) =>
  and(
    eq(files.id, fileId),
    eq(files.organizationId, ctx.organizationId),
    eq(files.uploadedByUserId, ctx.user.id),
    eq(files.purpose, purpose),
    eq(files.status, 'ready'),
    isNull(files.attachedAt),
  )

/**
 * Copies the caller's finished upload from `incoming/` to `kept/` (checked by size), before the
 * record's transaction opens, so no row lock is held across a bucket round trip (review: the
 * parcel counter was). Idempotent: a copy already there is reused. Then `attachFile(…, { kept:
 * true })` inside the transaction only checks and updates. A file that isn't attachable is
 * BAD_REQUEST `file_unavailable` here already.
 */
export async function keepUpload(
  ctx: Pick<ServiceContext, 'db' | 'organizationId' | 'user'> & { storage: Storage },
  fileId: string,
  purpose: FilePurpose,
): Promise<void> {
  const [file] = await ctx.db
    .select({ objectKey: files.objectKey, sizeBytes: files.sizeBytes })
    .from(files)
    .where(attachable(ctx, fileId, purpose))
  if (!file) throw badRequest('file_unavailable', FILE_UNAVAILABLE)
  await keepCopy(ctx.storage, file.objectKey, keptKey(ctx.organizationId, fileId), file.sizeBytes)
}

/**
 * Marks the caller's finished upload as held by a record, inside the record's own transaction:
 * one conditional update that records the kept key. The file must be this organization's,
 * uploaded by this person, for this purpose, ready and not held by another record. Anything else
 * (another organization's included) is the same BAD_REQUEST `file_unavailable`, so it says
 * nothing about other rows. The sweep removes the `incoming/` copy later.
 *
 * Without `kept` (keepUpload already ran) it makes the bucket-side copy first, inside the
 * caller's transaction. The copy can't be part of the transaction. If the update loses a race,
 * or the caller's transaction rolls back, the `kept/` copy is an orphan nothing points at.
 * That's accepted for now (a few MB, never served: links read only keys recorded on attached
 * rows) and reconciled later against the bucket listing. A retry reuses it rather than
 * overwriting (bucket lock).
 */
export async function attachFile(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'user'> & { storage: Storage },
  fileId: string,
  purpose: FilePurpose,
  options: { kept?: boolean } = {},
): Promise<AttachedFile> {
  const kept = keptKey(ctx.organizationId, fileId)
  if (!options.kept) {
    const [file] = await tx
      .select({ objectKey: files.objectKey, sizeBytes: files.sizeBytes })
      .from(files)
      .where(attachable(ctx, fileId, purpose))
    if (!file) throw badRequest('file_unavailable', FILE_UNAVAILABLE)
    await keepCopy(ctx.storage, file.objectKey, kept, file.sizeBytes)
  }
  const [row] = await tx
    .update(files)
    .set({ attachedAt: new Date(), objectKey: kept })
    .where(attachable(ctx, fileId, purpose))
    .returning({
      id: files.id,
      originalName: files.originalName,
      contentType: files.contentType,
      sizeBytes: files.sizeBytes,
      sha256: files.sha256,
    })
  if (!row?.contentType || !row.sha256) throw badRequest('file_unavailable', FILE_UNAVAILABLE)
  return { ...row, contentType: row.contentType, sha256: row.sha256 }
}

/** Copies to `kept/` unless an earlier attempt already did, then checks the size arrived. */
async function keepCopy(storage: Storage, from: string, to: string, sizeBytes: number) {
  if ((await storage.head(to))?.sizeBytes === sizeBytes) return
  try {
    await storage.copyObject(from, to)
  } catch (error) {
    // The incoming bytes are gone (swept a moment ago): the person uploads again.
    if (error instanceof StorageError && error.kind === 'not_found') {
      throw badRequest('file_unavailable', FILE_UNAVAILABLE)
    }
    throw error
  }
  if ((await storage.head(to))?.sizeBytes !== sizeBytes) {
    throw new Error('The kept copy does not match the upload')
  }
}

export type DownloadLink = { url: string; expiresAt: string }

/**
 * A 5-minute link to a file a record of this organization holds, for the purpose the caller
 * holds it under, served with the sniffed type, a forced Content-Disposition and no caching.
 * Anything else (not attached, another purpose, another organization) is NOT_FOUND. The owning
 * module checks view permission and company access first, and audits the link it issues;
 * links are never cached or logged.
 */
export async function signDownload(
  ctx: Pick<ServiceContext, 'db' | 'organizationId'> & { storage: Storage },
  fileId: string,
  options: { purpose: FilePurpose; disposition: 'inline' | 'attachment'; filename: string },
): Promise<DownloadLink> {
  const [file] = await ctx.db
    .select({ objectKey: files.objectKey, contentType: files.contentType, purpose: files.purpose })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.organizationId, ctx.organizationId),
        eq(files.status, 'ready'),
        isNotNull(files.attachedAt),
      ),
    )
  // Compared here rather than in SQL, so a purpose the enum doesn't know yet reads as missing.
  if (!file?.contentType || file.purpose !== options.purpose) throw notFound()
  const expiresAt = inSeconds(DOWNLOAD_URL_SECONDS)
  const url = await ctx.storage.signDownload(file.objectKey, {
    expiresInSeconds: DOWNLOAD_URL_SECONDS,
    contentType: file.contentType,
    contentDisposition: contentDisposition(
      options.disposition,
      withExtension(options.filename, file.contentType),
    ),
  })
  return { url, expiresAt }
}

/** "C of O" + application/pdf → "C of O.pdf"; a name that already says the kind is kept. */
export function withExtension(filename: string, contentType: string): string {
  const kind = Object.values(FILE_KINDS).find((k) => k.contentType === contentType)
  if (!kind) return filename
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  const known = filename.includes('.') && (kind.extensions as readonly string[]).includes(ext)
  return known ? filename : `${filename}.${kind.extensions[0]}`
}

const NOT_HEADER_SAFE = /[^\x20-\x7e]|["\\]/g

/** RFC 6266: an ASCII fallback for old clients plus the UTF-8 name (e.g. "Ọ̀dúnayọ̀ receipt.pdf"). */
export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const fallback = filename.replace(NOT_HEADER_SAFE, '_')
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
