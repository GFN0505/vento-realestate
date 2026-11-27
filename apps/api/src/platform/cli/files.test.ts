import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { createMemoryStorage, type MemoryStorage } from '@/storage/memory-driver'
import { withRollback } from '@/test/db'
import { createOrganization, createReadyFile } from '@/test/factories'
import { memoryIo } from './io'
import { runCommand } from './run'

// `pnpm files sweep`: the daily tidy-up of uploads no record took (decision 0025).

async function run(db: DbOrTx, storage: MemoryStorage, scheduled: boolean) {
  const io = memoryIo([])
  const code = await runCommand('files', ['sweep'], {
    db,
    io,
    operator: 'cron@api-1',
    mailer: createMemoryTransport(),
    storage,
    now: () => new Date(),
    scheduled,
  })
  return { code, io }
}

async function staleFile(tx: DbOrTx, storage: MemoryStorage) {
  const org = await createOrganization(tx)
  const createdAt = new Date(Date.now() - 25 * 3600_000)
  return createReadyFile(tx, org, { uploadedBy: org.owner, storage, createdAt })
}

describe('files sweep', () => {
  it('deletes stale unattached uploads from the scheduler', () =>
    withRollback(async (tx) => {
      const storage = createMemoryStorage()
      const file = await staleFile(tx, storage)
      const { code, io } = await run(tx, storage, true)
      expect(code).toBe(0)
      expect(io.output.at(-1)).toMatch(
        /^Unused uploads deleted: [1-9]\d*\. Incoming copies of kept files removed: \d+\.$/,
      )
      expect(await tx.select().from(files).where(eq(files.id, file.id))).toEqual([])
      expect(storage.hasObject(file.objectKey)).toBe(false)
    }))

  it('needs a super-admin by hand', () =>
    withRollback(async (tx) => {
      const storage = createMemoryStorage()
      const file = await staleFile(tx, storage)
      const { code } = await run(tx, storage, false)
      expect(code).toBe(1)
      expect(await tx.select().from(files).where(eq(files.id, file.id))).toHaveLength(1)
    }))
})
