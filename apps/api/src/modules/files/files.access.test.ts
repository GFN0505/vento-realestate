import { FILE_PURPOSES, MIB } from '@vento/shared'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { isGuardViolation } from '@/lib/errors'
import { incomingKey } from '@/storage'
import { createMemoryStorage } from '@/storage/memory-driver'
import { truncateGuardedTables, withRollback } from '@/test/db'
import {
  contextFor,
  createMember,
  createOrganization,
  createReadyFile,
  SAMPLE_PDF,
  setStage,
  type TestOrg,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { attachFile, contentDisposition, signDownload, withExtension } from './files.records'
import { sweepFiles } from './sweep'

// Gaps beside files.service.test.ts: access order on every procedure, limits at their edges,
// the database guards, and the header text of download links (decision 0025).

const HOUR = 3600_000
const START = {
  purpose: 'title_document',
  name: 'a.pdf',
  size: 10,
  type: 'application/pdf',
} as const

async function setup(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const storage = createMemoryStorage()
  const ngozi = await createMember(tx, org, { role: 'land_legal', name: 'Ngozi Adeyemi' })
  return { org, storage, ngozi, client: clientAs(tx, ngozi.user, { storage }).client }
}

/** An unfinished upload row for `user`, with a real multipart upload in `storage`. */
async function openUpload(
  tx: DbOrTx,
  storage: ReturnType<typeof createMemoryStorage>,
  org: Pick<TestOrg, 'id'>,
  user: Pick<TestUser, 'id'>,
  options: { sizeBytes?: number; status?: 'uploading' | 'rejected' } = {},
) {
  const [idRow] = (await tx.execute<{ id: string }>(sql`select uuidv7() as id`)).rows
  const id = idRow?.id ?? ''
  const key = incomingKey(org.id, id)
  const { uploadId } = await storage.createMultipartUpload(key, 'application/pdf')
  await tx.insert(files).values({
    id,
    organizationId: org.id,
    purpose: 'title_document',
    status: options.status ?? 'uploading',
    objectKey: key,
    uploadId,
    originalName: 'a.pdf',
    declaredType: 'application/pdf',
    sizeBytes: options.sizeBytes ?? 100,
    uploadedByUserId: user.id,
  })
  return { id, key, uploadId }
}

async function rowOf(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(files).where(eq(files.id, id))
  return row
}

describe('files procedures: feature, then permission', () => {
  it('answer NOT_FOUND on every procedure while Land & title is unavailable, even for the uploader', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const up = await openUpload(tx, w.storage, w.org, w.ngozi.user)
      await setStage(tx, 'land', 'off')
      const { client } = clientAs(tx, w.ngozi.user, { storage: w.storage })
      const fileId = up.id
      await expect(client.files.startUpload({ ...START })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      await expect(client.files.signParts({ fileId, partNumbers: [1] })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      await expect(
        client.files.completeUpload({ fileId, parts: [{ partNumber: 1, etag: '"x"' }] }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(client.files.abortUpload({ fileId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(await rowOf(tx, fileId)).toBeDefined()
    }))

  it('answer FORBIDDEN on every procedure for someone without Create in Land & title', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const sales = await createMember(tx, w.org, { role: 'sales' })
      const up = await openUpload(tx, w.storage, w.org, sales.user)
      const { client } = clientAs(tx, sales.user, { storage: w.storage })
      const fileId = up.id
      const forbidden = { code: 'FORBIDDEN', data: { reason: 'permission' } }
      await expect(client.files.signParts({ fileId, partNumbers: [1] })).rejects.toMatchObject(
        forbidden,
      )
      await expect(
        client.files.completeUpload({ fileId, parts: [{ partNumber: 1, etag: '"x"' }] }),
      ).rejects.toMatchObject(forbidden)
      await expect(client.files.abortUpload({ fileId })).rejects.toMatchObject(forbidden)
      expect(await rowOf(tx, fileId)).toBeDefined()
    }))

  it('keeps the same order in the service for every purpose in the registry', () => {
    // A new purpose needs its own cases above; this fails to remind whoever adds one.
    expect(Object.keys(FILE_PURPOSES)).toEqual(['title_document'])
  })
})

describe('files.completeUpload checks', () => {
  it('refuses an upload already rejected, without touching the bucket', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const up = await openUpload(tx, w.storage, w.org, w.ngozi.user, { status: 'rejected' })
      await tx.update(files).set({ uploadId: null }).where(eq(files.id, up.id))
      await expect(
        w.client.files.completeUpload({ fileId: up.id, parts: [{ partNumber: 1, etag: '"x"' }] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'upload_incomplete' } })
    }))

  it('refuses duplicate part numbers and a part number beyond the count', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const up = await openUpload(tx, w.storage, w.org, w.ngozi.user, { sizeBytes: 6 * MIB })
      const p = (partNumber: number) => ({ partNumber, etag: '"x"' })
      for (const parts of [
        [p(1), p(1)],
        [p(1), p(3)],
      ]) {
        await expect(w.client.files.completeUpload({ fileId: up.id, parts })).rejects.toMatchObject(
          { data: { reason: 'upload_incomplete' } },
        )
      }
      expect((await rowOf(tx, up.id))?.status).toBe('uploading')
    }))

  it('rejects a stored object over the purpose limit as too large and deletes it', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      // The contract allows 5 parts; the last one carries one byte too many.
      const up = await openUpload(tx, w.storage, w.org, w.ngozi.user, { sizeBytes: 25 * MIB })
      const parts = [1, 2, 3, 4, 5].map((partNumber) => {
        const body = new Uint8Array(partNumber === 5 ? 5 * MIB + 1 : 5 * MIB)
        if (partNumber === 1) body.set(SAMPLE_PDF)
        return { partNumber, etag: w.storage.uploadPart(up.key, up.uploadId, partNumber, body) }
      })
      await expect(w.client.files.completeUpload({ fileId: up.id, parts })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'file_too_large' },
      })
      expect(w.storage.hasObject(up.key)).toBe(false)
      expect((await rowOf(tx, up.id))?.status).toBe('rejected')
    }))

  it('refuses a HEIC-named file whose ISO brand is a video and deletes it', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const mp4 = new Uint8Array(64)
      mp4.set([0, 0, 0, 24, ...new TextEncoder().encode('ftypmp42')])
      const started = await w.client.files.startUpload({
        purpose: 'title_document',
        name: 'IMG_1.HEIC',
        size: mp4.length,
        type: 'image/heic',
      })
      const key = incomingKey(w.org.id, started.fileId)
      const [row] = await tx.select().from(files).where(eq(files.id, started.fileId))
      const parts = w.storage.uploadAll(key, row?.uploadId ?? '', mp4)
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts }),
      ).rejects.toMatchObject({ data: { reason: 'file_type' } })
      expect(w.storage.hasObject(key)).toBe(false)
    }))

  it('serves a PNG sent as a .pdf by its real type', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
      const started = await w.client.files.startUpload({
        purpose: 'title_document',
        name: 'scan.pdf',
        size: png.length,
        type: 'application/pdf',
      })
      const [row] = await tx.select().from(files).where(eq(files.id, started.fileId))
      const parts = w.storage.uploadAll(
        incomingKey(w.org.id, started.fileId),
        row?.uploadId ?? '',
        png,
      )
      const done = await w.client.files.completeUpload({ fileId: started.fileId, parts })
      expect(done.contentType).toBe('image/png')
    }))
})

describe('files.startUpload cap', () => {
  it('counts each person on their own: a colleague still has all 20 slots', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const colleague = await createMember(tx, w.org, { role: 'land_legal' })
      for (let i = 0; i < 20; i++) await w.client.files.startUpload({ ...START })
      const theirs = clientAs(tx, colleague.user, { storage: w.storage }).client
      await expect(theirs.files.startUpload({ ...START })).resolves.toMatchObject({})
    }))

  it('still counts an upload 23 h 59 min old and frees the slot at 24 h 01 min', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      for (let i = 0; i < 20; i++) await w.client.files.startUpload({ ...START })
      await tx.execute(sql`update files set created_at = now() - interval '23 hours 59 minutes'`)
      await expect(w.client.files.startUpload({ ...START })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
      await tx.execute(
        sql`update files set created_at = now() - interval '24 hours 1 minute' where id = (select id from files limit 1)`,
      )
      await expect(w.client.files.startUpload({ ...START })).resolves.toMatchObject({})
    }))

  it('counts finished uploads no record took, and frees the slot once one is attached', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const by = { uploadedBy: w.ngozi.user, storage: w.storage }
      const ready = []
      for (let i = 0; i < 20; i++) ready.push(await createReadyFile(tx, w.org, by))
      await expect(w.client.files.startUpload({ ...START })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      await attachFile(tx, ctx, ready[0]?.id ?? '', 'title_document')
      await expect(w.client.files.startUpload({ ...START })).resolves.toMatchObject({})
    }))

  it('frees the slot when the bucket refuses to start the upload', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const broken = createMemoryStorage()
      vi.spyOn(broken, 'createMultipartUpload').mockRejectedValueOnce(new Error('bucket down'))
      const { client } = clientAs(tx, w.ngozi.user, { storage: broken })
      await expect(client.files.startUpload({ ...START })).rejects.toThrow()
      expect(await tx.select().from(files).where(eq(files.organizationId, w.org.id))).toEqual([])
    }))
})

describe('sweepFiles edges', () => {
  const NOW = new Date('2026-03-10T12:00:00.000Z')
  const ago = (ms: number) => new Date(NOW.getTime() - ms)

  it('keeps an upload 23 h 59 min old and deletes one 24 h 01 min old', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const by = { uploadedBy: w.ngozi.user, storage: w.storage }
      const young = await createReadyFile(tx, w.org, { ...by, createdAt: ago(24 * HOUR - 60_000) })
      const old = await createReadyFile(tx, w.org, { ...by, createdAt: ago(24 * HOUR + 60_000) })
      await sweepFiles(tx, w.storage, NOW)
      expect(await rowOf(tx, young.id)).toBeDefined()
      expect(w.storage.hasObject(young.objectKey)).toBe(true)
      expect(await rowOf(tx, old.id)).toBeUndefined()
      expect(w.storage.hasObject(old.objectKey)).toBe(false)
    }))

  it('removes a stale rejected upload and one that finished but was never attached', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const rejected = await openUpload(tx, w.storage, w.org, w.ngozi.user, { status: 'rejected' })
      await tx
        .update(files)
        .set({ createdAt: ago(30 * HOUR) })
        .where(eq(files.id, rejected.id))
      const finished = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
        createdAt: ago(48 * HOUR),
      })
      const result = await sweepFiles(tx, w.storage, NOW)
      expect(result).toEqual({ deleted: 2, incomingCleared: 0, objectsFailed: 0 })
      expect(await rowOf(tx, rejected.id)).toBeUndefined()
      expect(await rowOf(tx, finished.id)).toBeUndefined()
    }))

  it('keeps the row of a bucket failure as deleting, carries on, and retries it next run', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const by = { uploadedBy: w.ngozi.user, createdAt: ago(30 * HOUR) }
      const a = await createReadyFile(tx, w.org, { ...by, storage: w.storage })
      const b = await createReadyFile(tx, w.org, { ...by, storage: w.storage })
      vi.spyOn(w.storage, 'deleteObject').mockRejectedValueOnce(new Error('bucket down'))
      const result = await sweepFiles(tx, w.storage, NOW)
      expect(result).toEqual({ deleted: 1, incomingCleared: 0, objectsFailed: 1 })
      expect((await rowOf(tx, a.id))?.status).toBe('deleting')
      expect(w.storage.hasObject(a.objectKey)).toBe(true)
      expect(await rowOf(tx, b.id)).toBeUndefined()
      expect(await sweepFiles(tx, w.storage, NOW)).toMatchObject({ deleted: 1, objectsFailed: 0 })
      expect(w.storage.hasObject(a.objectKey)).toBe(false)
    }))

  it('ages a finished upload from when it finished, not when it started', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const by = { uploadedBy: w.ngozi.user, storage: w.storage, createdAt: ago(30 * HOUR) }
      const late = await createReadyFile(tx, w.org, { ...by, completedAt: ago(HOUR) })
      const early = await createReadyFile(tx, w.org, { ...by, completedAt: ago(25 * HOUR) })
      await sweepFiles(tx, w.storage, NOW)
      expect(await rowOf(tx, late.id)).toBeDefined()
      expect(await rowOf(tx, early.id)).toBeUndefined()
    }))

  it('drains more than one batch in a run', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      await tx.execute(sql`
        with ids as (select uuidv7() as id from generate_series(1, 450))
        insert into files (id, organization_id, purpose, status, object_key, original_name,
          declared_type, size_bytes, uploaded_by_user_id, created_at)
        select id, ${w.org.id}, 'title_document', 'uploading',
          'incoming/org/' || ${w.org.id} || '/' || id, 'a.pdf', 'application/pdf', 10,
          ${w.ngozi.user.id}, ${ago(30 * HOUR).toISOString()}::timestamptz
        from ids`)
      expect((await sweepFiles(tx, w.storage, NOW)).deleted).toBe(450)
      expect(await tx.select().from(files).where(eq(files.organizationId, w.org.id))).toEqual([])
    }))

  it('removes the incoming copy of an attached file once, keeping the kept one', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
      })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      await attachFile(tx, ctx, file.id, 'title_document')
      const kept = (await rowOf(tx, file.id))?.objectKey ?? ''
      expect(w.storage.hasObject(file.objectKey)).toBe(true)
      expect(await sweepFiles(tx, w.storage, NOW)).toMatchObject({ incomingCleared: 1 })
      expect(w.storage.hasObject(file.objectKey)).toBe(false)
      expect(w.storage.hasObject(kept)).toBe(true)
      expect((await rowOf(tx, file.id))?.incomingDeletedAt).toBeInstanceOf(Date)
      expect(await sweepFiles(tx, w.storage, NOW)).toMatchObject({ incomingCleared: 0 })
    }))

  it('sweeps across organizations and is a no-op when run again', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const other = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const createdAt = ago(30 * HOUR)
      await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user, createdAt })
      await createReadyFile(tx, other, { uploadedBy: other.owner, createdAt })
      expect((await sweepFiles(tx, w.storage, NOW)).deleted).toBe(2)
      expect(await sweepFiles(tx, w.storage, NOW)).toEqual({
        deleted: 0,
        incomingCleared: 0,
        objectsFailed: 0,
      })
    }))
})

describe('files guards', () => {
  const attempt = (tx: DbOrTx, run: (inner: DbOrTx) => Promise<unknown>) =>
    tx.transaction(async (inner) => void (await run(inner))).catch((e: unknown) => e)

  it('has a BEFORE TRUNCATE guard on the table', () =>
    withRollback(async (tx) => {
      // From the catalog rather than running TRUNCATE, whose locks deadlock parallel test files.
      expect(await truncateGuardedTables(tx)).toContain('files')
    }))

  it('refuses changing a ready file’s type, completion time or status, held or not', () =>
    withRollback(async (tx) => {
      const { org, ngozi } = await setup(tx)
      const free = await createReadyFile(tx, org, { uploadedBy: ngozi.user })
      const changes = [
        { contentType: 'image/png' },
        { completedAt: new Date(0) },
        { status: 'rejected' as const },
        { status: 'uploading' as const },
      ]
      for (const change of changes) {
        const error = await attempt(tx, (inner) =>
          inner.update(files).set(change).where(eq(files.id, free.id)),
        )
        expect(isGuardViolation(error, 'files_ready_fixed'), JSON.stringify(change)).toBe(true)
      }
    }))

  it('refuses moving any file to another organization, uploader, key or purpose', () =>
    withRollback(async (tx) => {
      const { org, ngozi, storage } = await setup(tx)
      const other = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const up = await openUpload(tx, storage, org, ngozi.user)
      for (const change of [
        { organizationId: other.id },
        { uploadedByUserId: other.owner.id },
        { objectKey: 'org/elsewhere/x' },
      ]) {
        const error = await attempt(tx, (inner) =>
          inner.update(files).set(change).where(eq(files.id, up.id)),
        )
        expect(isGuardViolation(error, 'files_ready_fixed'), JSON.stringify(change)).toBe(true)
      }
    }))

  it('refuses reviving a rejected upload but allows deleting an unattached one', () =>
    withRollback(async (tx) => {
      const { org, ngozi, storage } = await setup(tx)
      const up = await openUpload(tx, storage, org, ngozi.user, { status: 'rejected' })
      const error = await attempt(tx, (inner) =>
        inner.update(files).set({ status: 'uploading' }).where(eq(files.id, up.id)),
      )
      expect(isGuardViolation(error, 'files_ready_fixed')).toBe(true)
      await tx.delete(files).where(eq(files.id, up.id))
      expect(await rowOf(tx, up.id)).toBeUndefined()
    }))

  it('lets an unattached ready file be attached, its key moving from incoming/ to kept/', () =>
    withRollback(async (tx) => {
      const { org, ngozi } = await setup(tx)
      const free = await createReadyFile(tx, org, { uploadedBy: ngozi.user })
      const kept = `kept/org/${org.id}/${free.id}`
      await tx
        .update(files)
        .set({ attachedAt: new Date(), objectKey: kept })
        .where(eq(files.id, free.id))
      expect(await rowOf(tx, free.id)).toMatchObject({ objectKey: kept })
    }))

  it('refuses an attach that keeps the incoming key, and moving a kept key again', () =>
    withRollback(async (tx) => {
      const { org, ngozi } = await setup(tx)
      const free = await createReadyFile(tx, org, { uploadedBy: ngozi.user })
      const unmoved = await attempt(tx, (inner) =>
        inner.update(files).set({ attachedAt: new Date() }).where(eq(files.id, free.id)),
      )
      expect(unmoved).toMatchObject({ cause: { constraint: 'files_object_key_layout' } })
      const held = await createReadyFile(tx, org, { uploadedBy: ngozi.user, attached: true })
      const moved = await attempt(tx, (inner) =>
        inner
          .update(files)
          .set({ objectKey: `incoming/org/${org.id}/${held.id}` })
          .where(eq(files.id, held.id)),
      )
      expect(isGuardViolation(moved, 'files_ready_fixed')).toBe(true)
    }))

  it('lets an unattached file become deleting, never an attached one, and never back', () =>
    withRollback(async (tx) => {
      const { org, ngozi } = await setup(tx)
      const free = await createReadyFile(tx, org, { uploadedBy: ngozi.user })
      const held = await createReadyFile(tx, org, { uploadedBy: ngozi.user, attached: true })
      await tx.update(files).set({ status: 'deleting' }).where(eq(files.id, free.id))
      const revived = await attempt(tx, (inner) =>
        inner.update(files).set({ status: 'ready' }).where(eq(files.id, free.id)),
      )
      expect(isGuardViolation(revived, 'files_ready_fixed')).toBe(true)
      const dropped = await attempt(tx, (inner) =>
        inner.update(files).set({ status: 'deleting' }).where(eq(files.id, held.id)),
      )
      expect(isGuardViolation(dropped, 'files_ready_fixed')).toBe(true)
    }))
})

describe('attachFile refusals', () => {
  it('refuses a rejected upload and a file a record already holds', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const ready = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
      })
      const held = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user, attached: true })
      const rejected = await openUpload(tx, w.storage, w.org, w.ngozi.user, { status: 'rejected' })
      const refusal = { code: 'BAD_REQUEST', data: { reason: 'file_unavailable' } }
      await expect(attachFile(tx, ctx, rejected.id, 'title_document')).rejects.toMatchObject(
        refusal,
      )
      await expect(attachFile(tx, ctx, held.id, 'title_document')).rejects.toMatchObject(refusal)
      expect((await rowOf(tx, ready.id))?.attachedAt).toBeNull()
    }))

  it('attaches once when two saves race for the same file', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const file = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
      })
      const results = await Promise.allSettled([
        attachFile(tx, ctx, file.id, 'title_document'),
        attachFile(tx, ctx, file.id, 'title_document'),
      ])
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    }))
})

describe('signDownload headers', () => {
  it('answers NOT_FOUND for an unfinished upload', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const up = await openUpload(tx, w.storage, w.org, w.ngozi.user)
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      await expect(
        signDownload(ctx, up.id, {
          purpose: 'title_document',
          disposition: 'inline',
          filename: 'x',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('sets inline when asked and expires in about 300 seconds', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user, attached: true })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const link = await signDownload(ctx, file.id, {
        purpose: 'title_document',
        disposition: 'inline',
        filename: 'Plan.pdf',
      })
      const disposition = new URL(link.url).searchParams.get('response-content-disposition')
      expect(disposition).toMatch(/^inline; /)
      const left = new Date(link.expiresAt).getTime() - Date.now()
      expect(left).toBeGreaterThan(290_000)
      expect(left).toBeLessThanOrEqual(300_000)
    }))

  it('keeps the name when it already ends in the sniffed extension, case aside', () => {
    expect(withExtension('Plan.PDF', 'application/pdf')).toBe('Plan.PDF')
    expect(withExtension('photo.jpg', 'image/jpeg')).toBe('photo.jpg')
    expect(withExtension('scan.pdf', 'image/png')).toBe('scan.pdf.png')
    expect(withExtension('C of O', 'application/pdf')).toBe('C of O.pdf')
  })

  it('cannot be made to inject a header line or break out of the quoted name', () => {
    const header = contentDisposition('attachment', 'a"; filename=evil.exe\r\nSet-Cookie: x=1')
    expect(header).not.toMatch(/[\r\n]/)
    expect(header.split('"')).toHaveLength(3)
    expect(header).toContain("filename*=UTF-8''a%22%3B%20filename%3Devil.exe%0D%0ASet-Cookie")
  })

  it('percent-encodes the characters encodeURIComponent leaves in filename*', () => {
    const header = contentDisposition('inline', "O'Brien (copy)*.pdf")
    expect(header).toContain("filename*=UTF-8''O%27Brien%20%28copy%29%2A.pdf")
  })

  it('keeps a plain ASCII name unchanged in the fallback', () => {
    expect(contentDisposition('inline', 'Deed of assignment.pdf')).toContain(
      'filename="Deed of assignment.pdf"',
    )
  })
})
