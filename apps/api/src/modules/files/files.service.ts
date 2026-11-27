import { createHash } from 'node:crypto'
import {
  type CompleteUploadOutput,
  type completeUploadInput,
  declaredKind,
  FILE_KINDS,
  FILE_PART_SIZE,
  FILE_PURPOSES,
  type FileKind,
  type FilePurpose,
  fileProblem,
  hasPermission,
  MAX_UPLOADS_IN_PROGRESS,
  PART_URL_SECONDS,
  partBytes,
  partCount,
  type SignPartsOutput,
  type StartUploadOutput,
  type signPartsInput,
  type startUploadInput,
  tooLargeMessage,
} from '@vento/shared'
import { and, count, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ServiceContext } from '@/access/context'
import { whoCanGrant } from '@/access/who-can-grant'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { badRequest, forbidden, notFound, tooManyRequests } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { type CompletedPart, incomingKey, type Storage, StorageError } from '@/storage'
import { SNIFF_BYTES, sniffKind } from '@/storage/sniff'
import { removeUnattached } from './remove'

// Private file uploads (decision 0025). The browser sends bytes straight to the bucket, under
// `incoming/`; this signs part links, then checks what arrived. Records take finished files
// through files.records.ts. File names and keys never go in logs: log ids.

type FilesContext = Pick<
  ServiceContext,
  'db' | 'organizationId' | 'user' | 'member' | 'features'
> & {
  storage: Storage
}

const DAY_MS = 24 * 3600_000

const UPLOAD_INCOMPLETE = "This upload didn't finish. Try again."
const TOO_MANY_UPLOADS = `You have ${MAX_UPLOADS_IN_PROGRESS} uploads in progress. Wait for one to finish, then try again.`

/**
 * The purpose's feature, then its permission: the same order and answers as the member
 * middleware (unavailable reads as missing; then "Only … can upload title documents.").
 */
async function requirePurposeAccess(ctx: FilesContext, purpose: FilePurpose): Promise<void> {
  const def = FILE_PURPOSES[purpose]
  if (!ctx.features.has(def.feature)) throw notFound()
  if (hasPermission(ctx.member.permissions, def.module, def.action)) return
  const advice = await whoCanGrant(ctx.db, {
    organizationId: ctx.organizationId,
    module: def.module,
    action: def.action,
    doing: def.doing,
    excludeUserId: ctx.user.id,
  })
  throw forbidden(
    'permission',
    advice.message,
    advice.askName && advice.askRole
      ? { askName: advice.askName, askRole: advice.askRole }
      : undefined,
  )
}

export const inSeconds = (seconds: number): string =>
  new Date(Date.now() + seconds * 1000).toISOString()

/** Each link is signed for its part's exact size, so the bucket refuses more bytes than declared. */
async function signParts(
  storage: Storage,
  file: { objectKey: string; uploadId: string; sizeBytes: number },
  partNumbers: readonly number[],
): Promise<StartUploadOutput['parts']> {
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await storage.signUploadPart(
        file.objectKey,
        file.uploadId,
        partNumber,
        partBytes(file.sizeBytes, partNumber),
        PART_URL_SECONDS,
      ),
    })),
  )
}

export async function startUpload(
  ctx: FilesContext,
  input: z.output<typeof startUploadInput>,
): Promise<StartUploadOutput> {
  await requirePurposeAccess(ctx, input.purpose)
  const problem = fileProblem(input.purpose, input)
  if (problem) throw badRequest(problem.reason, problem.message)
  const kind = declaredKind(input.name, input.type)
  // fileProblem passed, so this can't happen; it narrows the type.
  if (!kind) throw badRequest('file_type', FILE_PURPOSES[input.purpose].kindMessage)

  const row = await ctx.db.transaction(async (tx) => {
    // One person's starts queue behind each other, so the cap can't be passed by racing it.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`files:${ctx.user.id}`}::text, 0))`,
    )
    // Unfinished uploads and finished ones no record took yet: both hold bucket space. Ones the
    // sweep is about to remove (older than a day, as it ages them) don't hold a slot.
    const [open] = await tx
      .select({ n: count() })
      .from(files)
      .where(
        and(
          eq(files.organizationId, ctx.organizationId),
          eq(files.uploadedByUserId, ctx.user.id),
          inArray(files.status, ['uploading', 'ready']),
          isNull(files.attachedAt),
          gt(
            sql`coalesce(${files.completedAt}, ${files.createdAt})`,
            new Date(Date.now() - DAY_MS),
          ),
        ),
      )
    if ((open?.n ?? 0) >= MAX_UPLOADS_IN_PROGRESS) {
      throw tooManyRequests(TOO_MANY_UPLOADS, 60, 'uploads_in_progress')
    }
    const id = await newId(tx)
    const [inserted] = await tx
      .insert(files)
      .values({
        id,
        organizationId: ctx.organizationId,
        purpose: input.purpose,
        objectKey: incomingKey(ctx.organizationId, id),
        originalName: input.name,
        declaredType: input.type.slice(0, 200),
        sizeBytes: input.size,
        uploadedByUserId: ctx.user.id,
      })
      .returning({ id: files.id, objectKey: files.objectKey })
    if (!inserted) throw new Error('file insert returned nothing')
    return inserted
  })

  const uploadId = await ctx.storage
    .createMultipartUpload(row.objectKey, FILE_KINDS[kind].contentType)
    .then(
      (out) => out.uploadId,
      async (error: unknown) => {
        // Nothing was stored; don't leave a row holding one of the person's slots.
        await ctx.db.delete(files).where(and(eq(files.id, row.id), isNull(files.attachedAt)))
        throw error
      },
    )
  await ctx.db.update(files).set({ uploadId }).where(eq(files.id, row.id))
  const numbers = Array.from({ length: partCount(input.size) }, (_, i) => i + 1)
  // Stamped before signing, so the browser re-signs a moment early rather than late.
  const expiresAt = inSeconds(PART_URL_SECONDS)
  return {
    fileId: row.id,
    partSize: FILE_PART_SIZE,
    parts: await signParts(
      ctx.storage,
      { objectKey: row.objectKey, uploadId, sizeBytes: input.size },
      numbers,
    ),
    expiresAt,
  }
}

/** A UUID v7 from Postgres (decision 0012), needed before the insert: the key contains it. */
async function newId(tx: DbOrTx): Promise<string> {
  const result = await tx.execute<{ id: string }>(sql`select uuidv7() as id`)
  const id = result.rows[0]?.id
  if (!id) throw new Error('uuidv7() returned nothing')
  return id
}

type OwnFile = Pick<
  typeof files.$inferSelect,
  | 'id'
  | 'purpose'
  | 'status'
  | 'objectKey'
  | 'uploadId'
  | 'sizeBytes'
  | 'contentType'
  | 'attachedAt'
>

/** The signed-in person's own file in this organization; anyone else's reads as missing. */
async function loadOwnFile(ctx: FilesContext, fileId: string): Promise<OwnFile> {
  const [row] = await ctx.db
    .select({
      id: files.id,
      purpose: files.purpose,
      status: files.status,
      objectKey: files.objectKey,
      uploadId: files.uploadId,
      sizeBytes: files.sizeBytes,
      contentType: files.contentType,
      attachedAt: files.attachedAt,
    })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.organizationId, ctx.organizationId),
        eq(files.uploadedByUserId, ctx.user.id),
      ),
    )
  if (!row) throw notFound()
  return row
}

export async function signUploadParts(
  ctx: FilesContext,
  input: z.output<typeof signPartsInput>,
): Promise<SignPartsOutput> {
  const file = await loadOwnFile(ctx, input.fileId)
  if (file.status !== 'uploading' || !file.uploadId) throw notFound()
  await requirePurposeAccess(ctx, file.purpose)
  const parts = partCount(file.sizeBytes)
  if (input.partNumbers.some((n) => n > parts)) {
    throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
  }
  const expiresAt = inSeconds(PART_URL_SECONDS)
  return {
    parts: await signParts(
      ctx.storage,
      { objectKey: file.objectKey, uploadId: file.uploadId, sizeBytes: file.sizeBytes },
      input.partNumbers,
    ),
    expiresAt,
  }
}

/** Every part from 1 to the declared count, once each. */
function coversEveryPart(parts: readonly CompletedPart[], sizeBytes: number): boolean {
  const expected = partCount(sizeBytes)
  const numbers = new Set(parts.map((p) => p.partNumber))
  return parts.length === expected && numbers.size === expected && Math.max(...numbers) === expected
}

/**
 * Marks the row rejected, then deletes what was stored. The row goes first and conditionally, so
 * only the call that settled it deletes, and nothing can attach the file meanwhile (attach needs
 * `ready`). A bucket failure is logged and left: the sweep removes rejected rows and their bytes.
 */
async function reject(ctx: FilesContext, file: OwnFile): Promise<void> {
  const [settled] = await ctx.db
    .update(files)
    .set({ status: 'rejected', uploadId: null })
    .where(and(eq(files.id, file.id), eq(files.status, 'uploading')))
    .returning({ id: files.id })
  if (!settled) return
  logger.info('file_rejected', { fileId: file.id, organizationId: ctx.organizationId })
  await ctx.storage.deleteObject(file.objectKey).catch((error: unknown) => {
    logger.warn('file_reject_object_failed', {
      fileId: file.id,
      organizationId: ctx.organizationId,
      error: error instanceof Error ? error.name : 'unknown',
    })
  })
}

async function sha256Of(storage: Storage, key: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of await storage.readStream(key)) hash.update(chunk)
  return hash.digest('hex')
}

const readyAnswer = (file: Pick<OwnFile, 'id' | 'contentType' | 'sizeBytes'>) => ({
  fileId: file.id,
  contentType: file.contentType ?? '',
  sizeBytes: file.sizeBytes,
})

/**
 * Finishes the multipart upload, then checks the stored object: size from HEAD (the declared
 * size, within the purpose's limit), kind from the first bytes, and a SHA-256. Bucket calls run
 * outside any transaction; the final write is conditional on `uploading`, so a retried or
 * concurrent call settles once and the loser reads the winner's answer.
 */
export async function completeUpload(
  ctx: FilesContext,
  input: z.output<typeof completeUploadInput>,
): Promise<CompleteUploadOutput> {
  const file = await loadOwnFile(ctx, input.fileId)
  if (file.status === 'ready') return readyAnswer(file)
  // Rejected, or being cancelled (`deleting`): nothing left to finish.
  if (file.status !== 'uploading' || !file.uploadId) {
    throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
  }
  await requirePurposeAccess(ctx, file.purpose)
  if (!coversEveryPart(input.parts, file.sizeBytes)) {
    throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
  }
  try {
    await ctx.storage.completeMultipartUpload(file.objectKey, file.uploadId, input.parts)
  } catch (error) {
    if (!(error instanceof StorageError)) throw error
    // Missing or mismatched parts: the browser can send them again and retry.
    if (error.kind === 'invalid_parts') throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
    return afterUploadGone(ctx, file.id)
  }
  return checkStored(ctx, file)
}

/**
 * The multipart upload is gone. Another call completed it (answer as it did); or a call
 * completed it in the bucket and then failed before settling the row (a bucket or network
 * error), so the object is there and only the checks are left; or it was aborted. Without this
 * the row would stay `uploading` with a dead upload for ever.
 */
async function afterUploadGone(ctx: FilesContext, fileId: string): Promise<CompleteUploadOutput> {
  const now = await loadOwnFile(ctx, fileId)
  if (now.status === 'ready') return readyAnswer(now)
  if (now.status === 'uploading') {
    if (await ctx.storage.head(now.objectKey)) return checkStored(ctx, now)
    // Nothing stored and nothing to resume: settle it so signParts answers NOT_FOUND.
    await reject(ctx, now)
  }
  throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
}

async function checkStored(ctx: FilesContext, file: OwnFile): Promise<CompleteUploadOutput> {
  const def = FILE_PURPOSES[file.purpose]
  const head = await ctx.storage.head(file.objectKey)
  if (head && head.sizeBytes > def.maxBytes) {
    await reject(ctx, file)
    throw badRequest('file_too_large', tooLargeMessage(head.sizeBytes, file.purpose))
  }
  if (!head || head.sizeBytes !== file.sizeBytes) {
    await reject(ctx, file)
    throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
  }
  const kind = sniffKind(await ctx.storage.readRange(file.objectKey, 0, SNIFF_BYTES - 1))
  if (!kind || !(def.kinds as readonly FileKind[]).includes(kind)) {
    await reject(ctx, file)
    throw badRequest('file_type', def.kindMessage)
  }
  const sha256 = await sha256Of(ctx.storage, file.objectKey)
  const contentType = FILE_KINDS[kind].contentType
  const [settled] = await ctx.db
    .update(files)
    .set({ status: 'ready', contentType, sha256, completedAt: new Date(), uploadId: null })
    .where(and(eq(files.id, file.id), eq(files.status, 'uploading')))
    .returning({ id: files.id })
  if (!settled) {
    const now = await loadOwnFile(ctx, file.id)
    if (now.status === 'ready') return readyAnswer(now)
    throw badRequest('upload_incomplete', UPLOAD_INCOMPLETE)
  }
  return { fileId: file.id, contentType, sizeBytes: head.sizeBytes }
}

/**
 * Cancels an upload, or drops a finished one no record took (removed from a form before
 * saving). A file a record holds is never deleted here: it reads as missing. A bucket failure
 * leaves the row `deleting` for the sweep; the person's cancel still succeeds.
 */
export async function abortUpload(ctx: FilesContext, fileId: string): Promise<void> {
  const file = await loadOwnFile(ctx, fileId)
  if (file.attachedAt) throw notFound()
  await requirePurposeAccess(ctx, file.purpose)
  const outcome = await removeUnattached(ctx.db, ctx.storage, file.id)
  // Attached a moment ago by the record's own save: keep it.
  if (outcome === 'not_found') throw notFound()
}
