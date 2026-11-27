import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { logger } from '@/lib/logger'
import type { Storage } from '@/storage'

/**
 * `removed`: row and bytes gone. `not_found`: attached (kept) or already gone, nothing done.
 * `bucket_failed`: the row is left `deleting` and the next sweep retries it.
 */
export type RemoveOutcome = 'removed' | 'not_found' | 'bucket_failed'

/**
 * Removes an unattached upload in three steps (decision 0025): mark it `deleting` with a
 * conditional update (attach needs `ready`, so nothing can take it from here; a record that
 * attached it first wins and it is kept), then the bucket, then the row. Never inside a
 * transaction: the tombstone must be visible before the bucket call, and survive its failure.
 */
export async function removeUnattached(
  db: DbOrTx,
  storage: Storage,
  fileId: string,
): Promise<RemoveOutcome> {
  const [row] = await db
    .update(files)
    .set({ status: 'deleting' })
    .where(and(eq(files.id, fileId), isNull(files.attachedAt)))
    .returning({ objectKey: files.objectKey, uploadId: files.uploadId })
  if (!row) return 'not_found'
  try {
    if (row.uploadId) await storage.abortMultipartUpload(row.objectKey, row.uploadId)
    await storage.deleteObject(row.objectKey)
  } catch (error) {
    logger.warn('file_object_delete_failed', {
      fileId,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return 'bucket_failed'
  }
  await db
    .delete(files)
    .where(and(eq(files.id, fileId), eq(files.status, 'deleting'), isNull(files.attachedAt)))
  return 'removed'
}
