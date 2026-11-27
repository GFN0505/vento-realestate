import { createHash } from 'node:crypto'
import { type FilePurpose, MIB } from '@vento/shared'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { isGuardViolation } from '@/lib/errors'
import { incomingKey } from '@/storage'
import { createMemoryStorage, type MemoryStorage } from '@/storage/memory-driver'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createMember,
  createOrganization,
  createReadyFile,
  SAMPLE_PDF,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { attachFile, contentDisposition, signDownload } from './files.records'
import { sweepFiles } from './sweep'

const pdf = (size: number) => {
  const bytes = new Uint8Array(size)
  bytes.set(SAMPLE_PDF.subarray(0, Math.min(size, SAMPLE_PDF.length)))
  return bytes
}
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const EXE = new TextEncoder().encode('MZ\x90\x00 This program cannot be run in DOS mode')

async function setup(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const storage = createMemoryStorage()
  const ngozi = await createMember(tx, org, { role: 'land_legal', name: 'Ngozi Adeyemi' })
  return { org, storage, ngozi, client: clientAs(tx, ngozi.user, { storage }).client }
}

async function uploadIdOf(tx: DbOrTx, fileId: string): Promise<string> {
  const [row] = await tx
    .select({ uploadId: files.uploadId })
    .from(files)
    .where(eq(files.id, fileId))
  return row?.uploadId ?? ''
}

/** Starts, sends every part of `body` to the bucket and returns what to complete with. */
async function sendFile(
  tx: DbOrTx,
  w: { client: ReturnType<typeof clientAs>['client']; storage: MemoryStorage; org: { id: string } },
  body: Uint8Array,
  declared: { name?: string; type?: string; size?: number } = {},
) {
  const started = await w.client.files.startUpload({
    purpose: 'title_document',
    name: declared.name ?? 'Survey plan.pdf',
    size: declared.size ?? body.length,
    type: declared.type ?? 'application/pdf',
  })
  const key = incomingKey(w.org.id, started.fileId)
  const parts = w.storage.uploadAll(key, await uploadIdOf(tx, started.fileId), body)
  return { started, key, parts }
}

async function rowOf(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(files).where(eq(files.id, id))
  return row
}

describe('files.startUpload', () => {
  it('signs one 15-minute link per 5 MiB part, each for its exact size, under incoming/', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const out = await w.client.files.startUpload({
        purpose: 'title_document',
        name: 'Adeyemi family receipt.pdf',
        size: 12 * MIB,
        type: 'application/pdf',
      })
      expect(out.partSize).toBe(5 * MIB)
      expect(out.parts.map((p) => p.partNumber)).toEqual([1, 2, 3])
      expect(out.parts[0]?.url).toContain('X-Amz-Expires=900')
      const sizes = out.parts.map((p) => new URL(p.url).searchParams.get('content-length'))
      expect(sizes).toEqual([String(5 * MIB), String(5 * MIB), String(2 * MIB)])
      const row = await rowOf(tx, out.fileId)
      expect(row).toMatchObject({ status: 'uploading', originalName: 'Adeyemi family receipt.pdf' })
      expect(row?.objectKey).toBe(`incoming/org/${w.org.id}/${out.fileId}`)
    }))

  it('refuses another format and a file over 25 MB with the spec copy', () =>
    withRollback(async (tx) => {
      const { client } = await setup(tx)
      const base = { purpose: 'title_document', name: 'plan.pdf', size: 1000 } as const
      await expect(
        client.files.startUpload({ ...base, name: 'plan.docx', type: 'application/msword' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Upload a PDF or a photo (JPG, PNG or HEIC).',
        data: { reason: 'file_type' },
      })
      await expect(
        client.files.startUpload({ ...base, size: 31 * MIB, type: 'application/pdf' }),
      ).rejects.toMatchObject({
        message: 'This file is 31 MB. Upload files up to 25 MB.',
        data: { reason: 'file_too_large' },
      })
    }))

  it('answers NOT_FOUND where Land & title is unavailable, before the permission check', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { releaseGroup: 'standard', planKey: 'enterprise' })
      const { user } = await createMember(tx, org, { role: 'sales' })
      const input = {
        purpose: 'title_document',
        name: 'a.pdf',
        size: 10,
        type: 'application/pdf',
      } as const
      for (const who of [org.owner, user]) {
        await expect(
          clientAs(tx, who).client.files.startUpload({ ...input }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      }
    }))

  it('refuses someone without Create in Land & title, naming who can grant it', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'sales' })
      await expect(
        clientAs(tx, user).client.files.startUpload({
          purpose: 'title_document',
          name: 'a.pdf',
          size: 10,
          type: 'application/pdf',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'permission' },
        message: expect.stringContaining('upload title documents'),
      })
      expect(await tx.select().from(files).where(eq(files.organizationId, org.id))).toEqual([])
    }))

  it('caps one person at 20 uploads in progress; abandoned ones older than a day do not count', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const input = {
        purpose: 'title_document',
        name: 'a.pdf',
        size: 10,
        type: 'application/pdf',
      } as const
      for (let i = 0; i < 20; i++) await w.client.files.startUpload({ ...input })
      await expect(w.client.files.startUpload({ ...input })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        data: { reason: 'uploads_in_progress' },
      })
      await tx.execute(
        sql`update files set created_at = now() - interval '25 hours' where id in (select id from files where uploaded_by_user_id = ${w.ngozi.user.id} limit 1)`,
      )
      await expect(w.client.files.startUpload({ ...input })).resolves.toMatchObject({})
    }))
})

describe('files.completeUpload', () => {
  it('checks the bytes, records the SHA-256 and answers the same when retried', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const body = pdf(6 * MIB)
      const { started, parts } = await sendFile(tx, w, body)
      const done = await w.client.files.completeUpload({ fileId: started.fileId, parts })
      expect(done).toEqual({
        fileId: started.fileId,
        contentType: 'application/pdf',
        sizeBytes: 6 * MIB,
      })
      const row = await rowOf(tx, started.fileId)
      expect(row).toMatchObject({ status: 'ready', uploadId: null, attachedAt: null })
      expect(row?.sha256).toBe(createHash('sha256').update(body).digest('hex'))
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts }),
      ).resolves.toEqual(done)
    }))

  it('serves a HEIC the browser sent with no type as image/heic', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const heic = new Uint8Array(64)
      heic.set([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic')])
      const { started, parts } = await sendFile(tx, w, heic, { name: 'IMG_0042.HEIC', type: '' })
      const done = await w.client.files.completeUpload({ fileId: started.fileId, parts })
      expect(done.contentType).toBe('image/heic')
    }))

  it('refuses a program renamed .pdf and deletes it from the bucket', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started, key, parts } = await sendFile(tx, w, EXE)
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'file_type' } })
      expect(w.storage.hasObject(key)).toBe(false)
      expect((await rowOf(tx, started.fileId))?.status).toBe('rejected')
    }))

  it('refuses a file whose size differs from the one declared and deletes it', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const png = Uint8Array.from([...PNG_HEAD, 1, 2, 3])
      const { started, key, parts } = await sendFile(tx, w, png, {
        name: 'a.png',
        type: 'image/png',
        size: png.length + 1,
      })
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts }),
      ).rejects.toMatchObject({ data: { reason: 'upload_incomplete' } })
      expect(w.storage.hasObject(key)).toBe(false)
    }))

  it('finishes on retry when the bucket completed the upload but the checks then failed', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started, parts } = await sendFile(tx, w, pdf(6 * MIB))
      vi.spyOn(w.storage, 'head').mockRejectedValueOnce(new Error('bucket timed out'))
      const complete = () => w.client.files.completeUpload({ fileId: started.fileId, parts })
      await expect(complete()).rejects.toThrow('bucket timed out')
      expect((await rowOf(tx, started.fileId))?.status).toBe('uploading')
      await expect(complete()).resolves.toMatchObject({ sizeBytes: 6 * MIB })
      expect(await rowOf(tx, started.fileId)).toMatchObject({ status: 'ready', uploadId: null })
    }))

  it('settles an upload aborted in the bucket as rejected, so no more part links are signed', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started, key, parts } = await sendFile(tx, w, pdf(100))
      await w.storage.abortMultipartUpload(key, await uploadIdOf(tx, started.fileId))
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts }),
      ).rejects.toMatchObject({ data: { reason: 'upload_incomplete' } })
      expect(await rowOf(tx, started.fileId)).toMatchObject({ status: 'rejected', uploadId: null })
      await expect(
        w.client.files.signParts({ fileId: started.fileId, partNumbers: [1] }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('refuses missing or mismatched parts and keeps the upload open to retry', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started, parts } = await sendFile(tx, w, pdf(6 * MIB))
      const [first, second] = parts
      if (!first || !second) throw new Error('expected two parts')
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts: [first] }),
      ).rejects.toMatchObject({ data: { reason: 'upload_incomplete' } })
      await expect(
        w.client.files.completeUpload({
          fileId: started.fileId,
          parts: [first, { ...second, etag: '"wrong"' }],
        }),
      ).rejects.toMatchObject({ data: { reason: 'upload_incomplete' } })
      expect((await rowOf(tx, started.fileId))?.status).toBe('uploading')
      await expect(
        w.client.files.completeUpload({ fileId: started.fileId, parts }),
      ).resolves.toMatchObject({ sizeBytes: 6 * MIB })
    }))
})

describe('files: other people and organizations', () => {
  it("answers NOT_FOUND for another person's or organization's upload and changes nothing", () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started, parts } = await sendFile(tx, w, pdf(100))
      const colleague = await createMember(tx, w.org, { role: 'land_legal' })
      const other = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const callers: TestUser[] = [colleague.user, other.owner]
      for (const caller of callers) {
        const { client } = clientAs(tx, caller, { storage: w.storage })
        const fileId = started.fileId
        await expect(client.files.signParts({ fileId, partNumbers: [1] })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
        await expect(client.files.completeUpload({ fileId, parts })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
        await expect(client.files.abortUpload({ fileId })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
      }
      expect((await rowOf(tx, started.fileId))?.status).toBe('uploading')
    }))
})

describe('files.signParts and files.abortUpload', () => {
  it('re-signs parts of an unfinished upload, and only those that exist', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started } = await sendFile(tx, w, pdf(6 * MIB))
      const fresh = await w.client.files.signParts({ fileId: started.fileId, partNumbers: [2] })
      expect(fresh.parts.map((p) => p.partNumber)).toEqual([2])
      await expect(
        w.client.files.signParts({ fileId: started.fileId, partNumbers: [3] }),
      ).rejects.toMatchObject({ data: { reason: 'upload_incomplete' } })
    }))

  it('cancels an upload: the row, the parts and any bytes go', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const { started } = await sendFile(tx, w, pdf(100))
      const uploadId = await uploadIdOf(tx, started.fileId)
      await w.client.files.abortUpload({ fileId: started.fileId })
      expect(await rowOf(tx, started.fileId)).toBeUndefined()
      expect(w.storage.hasUpload(uploadId)).toBe(false)
    }))

  it('still cancels when the bucket fails, leaving the row deleting for the sweep', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
      })
      vi.spyOn(w.storage, 'deleteObject').mockRejectedValueOnce(new Error('bucket down'))
      await expect(w.client.files.abortUpload({ fileId: file.id })).resolves.toBeUndefined()
      expect((await rowOf(tx, file.id))?.status).toBe('deleting')
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      await expect(attachFile(tx, ctx, file.id, 'title_document')).rejects.toMatchObject({
        data: { reason: 'file_unavailable' },
      })
      expect((await sweepFiles(tx, w.storage, new Date())).deleted).toBe(1)
      expect(await rowOf(tx, file.id)).toBeUndefined()
      expect(w.storage.hasObject(file.objectKey)).toBe(false)
    }))

  it('never cancels a file a record holds', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const held = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user, attached: true })
      await expect(w.client.files.abortUpload({ fileId: held.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(await rowOf(tx, held.id)).toBeDefined()
    }))
})

describe('attachFile', () => {
  it("attaches the person's own finished upload once, copying it to kept/", () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
      })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const attached = await attachFile(tx, ctx, file.id, 'title_document')
      expect(attached).toMatchObject({ id: file.id, contentType: 'application/pdf' })
      const row = await rowOf(tx, file.id)
      expect(row?.attachedAt).toBeInstanceOf(Date)
      expect(row?.objectKey).toBe(`kept/org/${w.org.id}/${file.id}`)
      expect(await w.storage.readRange(row?.objectKey ?? '', 0, 4)).toEqual(SAMPLE_PDF.slice(0, 5))
      await expect(attachFile(tx, ctx, file.id, 'title_document')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'file_unavailable' },
        message: 'This file is no longer available. Upload it again.',
      })
    }))

  it("refuses another organization's file, a colleague's and an unfinished one alike", () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const other = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const theirs = await createReadyFile(tx, other, {
        uploadedBy: other.owner,
        storage: w.storage,
      })
      const colleague = await createMember(tx, w.org, { role: 'land_legal' })
      const colleagues = await createReadyFile(tx, w.org, {
        uploadedBy: colleague.user,
        storage: w.storage,
      })
      const { started } = await sendFile(tx, w, pdf(100))
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      for (const id of [theirs.id, colleagues.id, started.fileId]) {
        await expect(attachFile(tx, ctx, id, 'title_document')).rejects.toMatchObject({
          data: { reason: 'file_unavailable' },
        })
      }
      expect((await rowOf(tx, theirs.id))?.attachedAt).toBeNull()
      expect(w.storage.hasObject(`kept/org/${other.id}/${theirs.id}`)).toBe(false)
    }))

  it('reuses the kept copy when an earlier attach rolled back, instead of copying again', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        storage: w.storage,
      })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const copy = vi.spyOn(w.storage, 'copyObject')
      await tx
        .transaction(async (inner) => {
          await attachFile(inner, ctx, file.id, 'title_document')
          throw new Error('the record save failed')
        })
        .catch(() => undefined)
      expect((await rowOf(tx, file.id))?.attachedAt).toBeNull()
      await expect(attachFile(tx, ctx, file.id, 'title_document')).resolves.toMatchObject({})
      expect(copy).toHaveBeenCalledTimes(1)
    }))

  it('refuses a finished upload whose incoming bytes are already gone', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      await expect(attachFile(tx, ctx, file.id, 'title_document')).rejects.toMatchObject({
        data: { reason: 'file_unavailable' },
      })
      expect((await rowOf(tx, file.id))?.attachedAt).toBeNull()
    }))
})

describe('signDownload', () => {
  it('signs a 300-second link with the sniffed type and a forced disposition', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const file = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user, attached: true })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const link = await signDownload(ctx, file.id, {
        purpose: 'title_document',
        disposition: 'attachment',
        filename: 'Survey plan v2',
      })
      const url = new URL(link.url)
      expect(url.pathname).toContain(`/kept/org/${w.org.id}/${file.id}`)
      expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
      expect(url.searchParams.get('response-cache-control')).toBe('private, no-store')
      expect(url.searchParams.get('response-content-type')).toBe('application/pdf')
      expect(url.searchParams.get('response-content-disposition')).toBe(
        `attachment; filename="Survey plan v2.pdf"; filename*=UTF-8''Survey%20plan%20v2.pdf`,
      )
      expect(new Date(link.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000)
    }))

  it("answers NOT_FOUND for another organization's file", () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const other = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const theirs = await createReadyFile(tx, other, { uploadedBy: other.owner, attached: true })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      await expect(
        signDownload(ctx, theirs.id, {
          purpose: 'title_document',
          disposition: 'inline',
          filename: 'x',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('answers NOT_FOUND for a finished file no record holds, or asked for another purpose', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const free = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user })
      const held = await createReadyFile(tx, w.org, { uploadedBy: w.ngozi.user, attached: true })
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const link = { disposition: 'inline', filename: 'x' } as const
      await expect(
        signDownload(ctx, free.id, { ...link, purpose: 'title_document' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      // A purpose another module will add (receipts): the title document isn't one.
      const other = 'receipt' as FilePurpose
      await expect(signDownload(ctx, held.id, { ...link, purpose: other })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))

  it('keeps non-ASCII names readable and header-safe', () => {
    expect(contentDisposition('inline', 'Ọdúnayọ "receipt".pdf')).toBe(
      `inline; filename="_d_nay_ _receipt_.pdf"; filename*=UTF-8''%E1%BB%8Cd%C3%BAnay%E1%BB%8D%20%22receipt%22.pdf`,
    )
  })
})

describe('sweepFiles', () => {
  it('deletes uploads no record took after 24 hours, never attached or recent ones', () =>
    withRollback(async (tx) => {
      const w = await setup(tx)
      const old = new Date(Date.now() - 25 * 3600_000)
      const by = { uploadedBy: w.ngozi.user, storage: w.storage }
      const stale = await createReadyFile(tx, w.org, { ...by, createdAt: old })
      const held = await createReadyFile(tx, w.org, { ...by, createdAt: old, attached: true })
      const fresh = await createReadyFile(tx, w.org, by)
      const { started } = await sendFile(tx, w, pdf(100))
      await tx.update(files).set({ createdAt: old }).where(eq(files.id, started.fileId))
      const uploadId = await uploadIdOf(tx, started.fileId)

      const result = await sweepFiles(tx, w.storage, new Date())

      expect(result.deleted).toBeGreaterThanOrEqual(2)
      expect(await rowOf(tx, stale.id)).toBeUndefined()
      expect(w.storage.hasObject(stale.objectKey)).toBe(false)
      expect(await rowOf(tx, started.fileId)).toBeUndefined()
      expect(w.storage.hasUpload(uploadId)).toBe(false)
      expect(await rowOf(tx, held.id)).toBeDefined()
      expect(w.storage.hasObject(held.objectKey)).toBe(true)
      expect(await rowOf(tx, fresh.id)).toBeDefined()
    }))
})

describe('files guards (migration 0019)', () => {
  it('refuses deleting a file a record holds', () =>
    withRollback(async (tx) => {
      const { org, ngozi } = await setup(tx)
      const held = await createReadyFile(tx, org, { uploadedBy: ngozi.user, attached: true })
      const error = await tx
        .transaction(async (inner) => {
          await inner.delete(files).where(eq(files.id, held.id))
        })
        .catch((e: unknown) => e)
      expect(isGuardViolation(error, 'files_attached_kept')).toBe(true)
    }))

  it('refuses changing what was checked once a file is ready, or detaching it', () =>
    withRollback(async (tx) => {
      const { org, ngozi } = await setup(tx)
      const held = await createReadyFile(tx, org, { uploadedBy: ngozi.user, attached: true })
      for (const change of [{ sha256: '0'.repeat(64) }, { sizeBytes: 1 }, { attachedAt: null }]) {
        const error = await tx
          .transaction(async (inner) => {
            await inner.update(files).set(change).where(eq(files.id, held.id))
          })
          .catch((e: unknown) => e)
        expect(isGuardViolation(error, 'files_ready_fixed'), JSON.stringify(change)).toBe(true)
      }
    }))
})
