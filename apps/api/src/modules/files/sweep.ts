import { and, asc, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { logger } from '@/lib/logger'
import { incomingKey, type Storage } from '@/storage'
import { removeUnattached } from './remove'

const DAY_MS = 24 * 3600_000
const BATCH = 200
/** A safety net, far above a day's uploads: a run never loops for ever. */
const MAX_BATCHES = 500
const FIRST_ID = '00000000-0000-0000-0000-000000000000'

export type SweepResult = {
  /** Unattached uploads removed, row and bytes. */
  deleted: number
  /** Attached files whose `incoming/` copy was removed (the bytes stay in `kept/`). */
  incomingCleared: number
  /** Rows whose bucket call failed; left for the next run. */
  objectsFailed: number
}

/**
 * `pnpm files sweep` (daily, beside `approvals expire`). Across organizations: it's
 * housekeeping and never touches `kept/`.
 * 1. Uploads no record took within 24 hours of finishing (or of starting, if they never did),
 *    rejected ones included, and any left `deleting` by a failed cancel: tombstone, bucket, row
 *    (removeUnattached), so a record attaching one at that moment wins and keeps it.
 * 2. Attached files whose `incoming/` copy is still there: delete it, note when.
 * Each row on its own: one failure is logged by file id and counted, and the run goes on. Pages
 * by id, so a row that failed isn't picked again in the same run and the run drains everything.
 */
export async function sweepFiles(db: DbOrTx, storage: Storage, now: Date): Promise<SweepResult> {
  const result: SweepResult = { deleted: 0, incomingCleared: 0, objectsFailed: 0 }
  await removeStale(db, storage, now, result)
  await clearIncoming(db, storage, result)
  return result
}

async function removeStale(db: DbOrTx, storage: Storage, now: Date, result: SweepResult) {
  const cutoff = new Date(now.getTime() - DAY_MS)
  await eachBatch('file_sweep_stale', async (after) => {
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          isNull(files.attachedAt),
          gt(files.id, after),
          or(
            eq(files.status, 'deleting'),
            lt(sql`coalesce(${files.completedAt}, ${files.createdAt})`, cutoff),
          ),
        ),
      )
      .orderBy(asc(files.id))
      .limit(BATCH)
    for (const row of rows) {
      const outcome = await removeUnattached(db, storage, row.id).catch((error: unknown) => {
        // A database error on one row (e.g. a lock timeout) mustn't stop the run either.
        logger.warn('file_sweep_row_failed', {
          fileId: row.id,
          error: error instanceof Error ? error.name : 'unknown',
        })
        return 'bucket_failed' as const
      })
      if (outcome === 'removed') result.deleted += 1
      if (outcome === 'bucket_failed') result.objectsFailed += 1
    }
    return rows.map((r) => r.id)
  })
}

async function clearIncoming(db: DbOrTx, storage: Storage, result: SweepResult) {
  await eachBatch('file_sweep_incoming', async (after) => {
    const rows = await db
      .select({ id: files.id, organizationId: files.organizationId })
      .from(files)
      .where(and(isNotNull(files.attachedAt), isNull(files.incomingDeletedAt), gt(files.id, after)))
      .orderBy(asc(files.id))
      .limit(BATCH)
    for (const row of rows) {
      try {
        await storage.deleteObject(incomingKey(row.organizationId, row.id))
        await db
          .update(files)
          .set({ incomingDeletedAt: new Date() })
          .where(and(eq(files.id, row.id), isNull(files.incomingDeletedAt)))
        result.incomingCleared += 1
      } catch (error) {
        result.objectsFailed += 1
        logger.warn('file_sweep_incoming_failed', {
          fileId: row.id,
          error: error instanceof Error ? error.name : 'unknown',
        })
      }
    }
    return rows.map((r) => r.id)
  })
}

/** Runs `batch` from the first id until a short page; warns if the safety net stops it. */
async function eachBatch(
  name: string,
  batch: (afterId: string) => Promise<string[]>,
): Promise<void> {
  let after = FIRST_ID
  for (let n = 0; n < MAX_BATCHES; n++) {
    const ids = await batch(after)
    const last = ids.at(-1)
    if (ids.length < BATCH || !last) return
    after = last
  }
  logger.warn('file_sweep_batch_limit', { pass: name, rows: MAX_BATCHES * BATCH })
}
