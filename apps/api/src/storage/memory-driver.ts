import { createHash } from 'node:crypto'
import { FILE_PART_SIZE } from '@vento/shared'
import { assertDeletable, type CompletedPart, type Storage, StorageError } from './driver'

// Tests only (like the email `memory` transport): production refuses to start with it. It keeps
// the bucket rules that matter to the service: parts below 5 MiB except the last are refused, so
// are parts of unequal size before the last (R2's rule), ETags must match, a completed or aborted
// upload is gone, and signing a part never checks the upload (S3 signs offline; the PUT fails).

type PendingUpload = { key: string; parts: Map<number, { etag: string; body: Uint8Array }> }

export type MemoryStorage = Storage & {
  /** What the browser does with a part link: PUT the bytes, get an ETag back. */
  uploadPart(key: string, uploadId: string, partNumber: number, body: Uint8Array): string
  /** Uploads every part of `body` in 5 MiB pieces and returns the parts to complete with. */
  uploadAll(key: string, uploadId: string, body: Uint8Array): CompletedPart[]
  hasObject(key: string): boolean
  hasUpload(uploadId: string): boolean
}

const BASE = 'https://memory-storage.test/vento-test'

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

const etagOf = (body: Uint8Array) => `"${createHash('md5').update(body).digest('hex')}"`

export function createMemoryStorage(): MemoryStorage {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>()
  const uploads = new Map<string, PendingUpload>()
  let nextUpload = 0

  const pending = (key: string, uploadId: string): PendingUpload => {
    const upload = uploads.get(uploadId)
    if (!upload || upload.key !== key) {
      throw new StorageError('no_such_upload', 'The upload does not exist')
    }
    return upload
  }

  const storage: MemoryStorage = {
    driver: 'memory',

    async createMultipartUpload(key) {
      nextUpload += 1
      const uploadId = `mem-upload-${nextUpload}`
      uploads.set(uploadId, { key, parts: new Map() })
      return { uploadId }
    },

    async signUploadPart(key, uploadId, partNumber, contentLength, expiresInSeconds) {
      const q = new URLSearchParams({
        partNumber: String(partNumber),
        uploadId,
        'X-Amz-Expires': String(expiresInSeconds),
        'X-Amz-SignedHeaders': 'content-length;host',
        'content-length': String(contentLength),
      })
      return `${BASE}/${key}?${q}`
    },

    async completeMultipartUpload(key, uploadId, parts) {
      const upload = pending(key, uploadId)
      const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
      const bodies = sorted.map((p) => {
        const stored = upload.parts.get(p.partNumber)
        if (!stored || stored.etag !== p.etag) {
          throw new StorageError('invalid_parts', 'A part is missing or its ETag does not match')
        }
        return stored.body
      })
      const leading = bodies.slice(0, -1)
      if (leading.some((b) => b.length < FILE_PART_SIZE)) {
        throw new StorageError('invalid_parts', 'A part other than the last is too small')
      }
      if (leading.some((b) => b.length !== leading[0]?.length)) {
        throw new StorageError('invalid_parts', 'Parts other than the last differ in size')
      }
      uploads.delete(uploadId)
      objects.set(key, { body: concat(bodies), contentType: 'application/octet-stream' })
    },

    async abortMultipartUpload(_key, uploadId) {
      uploads.delete(uploadId)
    },

    async head(key) {
      const object = objects.get(key)
      return object ? { sizeBytes: object.body.length } : null
    },

    async copyObject(fromKey, toKey) {
      const object = objects.get(fromKey)
      if (!object) throw new StorageError('not_found', 'No such object')
      objects.set(toKey, { body: Uint8Array.from(object.body), contentType: object.contentType })
    },

    async readRange(key, start, end) {
      const object = objects.get(key)
      if (!object) throw new StorageError('not_found', 'No such object')
      return object.body.slice(start, end + 1)
    },

    async readStream(key) {
      const object = objects.get(key)
      if (!object) throw new StorageError('not_found', 'No such object')
      const body = object.body
      return (async function* () {
        for (let at = 0; at < body.length; at += 64 * 1024) yield body.subarray(at, at + 64 * 1024)
      })()
    },

    async putObject(key, body, contentType) {
      objects.set(key, { body: Uint8Array.from(body), contentType })
    },

    async deleteObject(key) {
      assertDeletable(key)
      objects.delete(key)
    },

    async signDownload(key, options) {
      const q = new URLSearchParams({
        'X-Amz-Expires': String(options.expiresInSeconds),
        'response-content-type': options.contentType,
        'response-content-disposition': options.contentDisposition,
        'response-cache-control': 'private, no-store',
      })
      return `${BASE}/${key}?${q}`
    },

    uploadPart(key, uploadId, partNumber, body) {
      const upload = pending(key, uploadId)
      const etag = etagOf(body)
      upload.parts.set(partNumber, { etag, body: Uint8Array.from(body) })
      return etag
    },

    uploadAll(key, uploadId, body) {
      const parts: CompletedPart[] = []
      for (let at = 0, n = 1; at < body.length || n === 1; at += FILE_PART_SIZE, n++) {
        const etag = storage.uploadPart(key, uploadId, n, body.subarray(at, at + FILE_PART_SIZE))
        parts.push({ partNumber: n, etag })
      }
      return parts
    },

    hasObject: (key) => objects.has(key),
    hasUpload: (uploadId) => uploads.has(uploadId),
  }
  return storage
}
