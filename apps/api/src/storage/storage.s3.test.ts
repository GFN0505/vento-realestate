import { createHash } from 'node:crypto'
import { FILE_PART_SIZE } from '@vento/shared'
import { afterAll, describe, expect, it } from 'vitest'
import { LOCAL_S3 } from './index'
import { createS3Storage } from './s3-driver'

// The contract test against a real S3-compatible bucket (decision 0025): the local container
// (`pnpm db:up`) or CI's. Runs when S3_ENDPOINT is set (.env.example and CI set it). Locally it
// skips if the container isn't running; in CI an unreachable bucket fails instead.

const configured = Boolean(process.env.S3_ENDPOINT)
const storage = createS3Storage({
  endpoint: process.env.S3_ENDPOINT ?? LOCAL_S3.endpoint,
  region: process.env.S3_REGION ?? LOCAL_S3.region,
  bucket: process.env.S3_BUCKET ?? LOCAL_S3.bucket,
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? LOCAL_S3.accessKeyId,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? LOCAL_S3.secretAccessKey,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
})

async function reachable(): Promise<boolean> {
  if (!configured) return false
  const probe = storage.head(`incoming/test/probe-${Date.now()}`).then(
    () => true,
    () => false,
  )
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
  const ok = await Promise.race([probe, timeout])
  if (!ok && process.env.CI) throw new Error('S3_ENDPOINT is set but the bucket is unreachable')
  return ok
}

const run = await reachable()
const keys: string[] = []
const key = (name: string) => {
  // Under incoming/, the only prefix the app may delete, so afterAll can clean up.
  const k = `incoming/test/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${name}`
  keys.push(k)
  return k
}

/** A PDF-looking body of `size` bytes. */
function body(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20)
  bytes.set(new TextEncoder().encode('%PDF-1.7\n'))
  return bytes
}

describe.skipIf(!run)('S3 storage contract', () => {
  afterAll(async () => {
    for (const k of keys) await storage.deleteObject(k)
  })

  it('uploads in parts through signed links, as the browser does, and reads it back', async () => {
    const k = key('multipart')
    const bytes = body(FILE_PART_SIZE + 1234)
    const { uploadId } = await storage.createMultipartUpload(k, 'application/pdf')
    const parts = []
    for (const [i, chunk] of [
      bytes.subarray(0, FILE_PART_SIZE),
      bytes.subarray(FILE_PART_SIZE),
    ].entries()) {
      const url = await storage.signUploadPart(k, uploadId, i + 1, chunk.length, 900)
      const res = await fetch(url, { method: 'PUT', body: chunk })
      expect(res.status, await res.clone().text()).toBe(200)
      parts.push({ partNumber: i + 1, etag: res.headers.get('etag') ?? '' })
    }
    await storage.completeMultipartUpload(k, uploadId, parts)

    expect(await storage.head(k)).toEqual({ sizeBytes: bytes.length })
    expect(new TextDecoder().decode(await storage.readRange(k, 0, 4))).toBe('%PDF-')
    const hash = createHash('sha256')
    for await (const chunk of await storage.readStream(k)) hash.update(chunk)
    expect(hash.digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'))
  })

  it('signs part links without checksum parameters, so a browser PUT needs no extra headers', async () => {
    const k = key('no-checksum')
    const { uploadId } = await storage.createMultipartUpload(k, 'application/pdf')
    const url = new URL(await storage.signUploadPart(k, uploadId, 1, 10, 900))
    const names = [...url.searchParams.keys()].map((n) => n.toLowerCase())
    expect(names.filter((n) => n.includes('checksum'))).toEqual([])
    // Content-Length is what fetch sends for the body anyway.
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    await storage.abortMultipartUpload(k, uploadId)
  })

  it('refuses completing with a wrong ETag as invalid parts', async () => {
    const k = key('bad-etag')
    const { uploadId } = await storage.createMultipartUpload(k, 'application/pdf')
    const url = await storage.signUploadPart(k, uploadId, 1, 10, 900)
    await fetch(url, { method: 'PUT', body: body(10) })
    await expect(
      storage.completeMultipartUpload(k, uploadId, [{ partNumber: 1, etag: '"0000"' }]),
    ).rejects.toMatchObject({ name: 'StorageError', kind: 'invalid_parts' })
    await storage.abortMultipartUpload(k, uploadId)
  })

  it('refuses a part body larger or smaller than the size its link was signed for', async () => {
    const k = key('content-length')
    const { uploadId } = await storage.createMultipartUpload(k, 'application/pdf')
    const url = await storage.signUploadPart(k, uploadId, 1, 100, 900)
    expect((await fetch(url, { method: 'PUT', body: body(101) })).status).toBe(403)
    expect((await fetch(url, { method: 'PUT', body: body(99) })).status).toBe(403)
    expect((await fetch(url, { method: 'PUT', body: body(100) })).status).toBe(200)
    await storage.abortMultipartUpload(k, uploadId)
  })

  it('refuses a part link replayed for another part number', async () => {
    const k = key('replay')
    const { uploadId } = await storage.createMultipartUpload(k, 'application/pdf')
    const url = new URL(await storage.signUploadPart(k, uploadId, 1, 10, 900))
    url.searchParams.set('partNumber', '2')
    expect((await fetch(url, { method: 'PUT', body: body(10) })).status).toBe(403)
    await storage.abortMultipartUpload(k, uploadId)
  })

  it('copies inside the bucket, for attaching a file to a record', async () => {
    const from = key('copy-from')
    const to = key('copy-to')
    await storage.putObject(from, body(64), 'application/pdf')
    await storage.copyObject(from, to)
    expect(await storage.head(to)).toEqual({ sizeBytes: 64 })
    await expect(storage.copyObject(key('missing'), to)).rejects.toMatchObject({
      kind: 'not_found',
    })
  })

  it('signs a 300-second download with the forced type and disposition', async () => {
    const k = key('download')
    await storage.putObject(k, body(64), 'application/octet-stream')
    const disposition = `attachment; filename="C of O.pdf"; filename*=UTF-8''C%20of%20O.pdf`
    const url = await storage.signDownload(k, {
      expiresInSeconds: 300,
      contentType: 'application/pdf',
      contentDisposition: disposition,
    })
    const params = new URL(url).searchParams
    expect(params.get('X-Amz-Expires')).toBe('300')
    expect(params.get('response-content-type')).toBe('application/pdf')
    expect(params.get('response-content-disposition')).toBe(disposition)
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(disposition)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('refuses a download link with an edited response type, and a request with no signature', async () => {
    const k = key('tamper')
    await storage.putObject(k, body(16), 'application/pdf')
    const url = new URL(
      await storage.signDownload(k, {
        expiresInSeconds: 300,
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
      }),
    )
    const edited = new URL(url)
    edited.searchParams.set('response-content-type', 'text/html')
    expect((await fetch(edited)).status).toBe(403)
    expect((await fetch(`${url.origin}${url.pathname}`)).status).toBe(403)
  })

  it('refuses a link once it has expired', async () => {
    const k = key('expired')
    await storage.putObject(k, body(16), 'application/pdf')
    const url = await storage.signDownload(k, {
      expiresInSeconds: 1,
      contentType: 'application/pdf',
      contentDisposition: 'inline',
    })
    await new Promise((resolve) => setTimeout(resolve, 2100))
    expect((await fetch(url)).status).toBe(403)
  })

  it('deletes, and reports a missing object as missing', async () => {
    const k = key('delete')
    await storage.putObject(k, body(16), 'application/pdf')
    await storage.deleteObject(k)
    expect(await storage.head(k)).toBeNull()
    await expect(storage.deleteObject(k)).resolves.toBeUndefined()
  })
})
