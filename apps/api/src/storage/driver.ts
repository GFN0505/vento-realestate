// The only way the app touches file bytes (decision 0025). Two drivers: `s3` (any S3-compatible
// bucket: Cloudflare R2, AWS S3, MinIO locally) and `memory` (tests). Keep it to plain S3 calls so
// moving provider stays config plus a bucket copy.

/** A finished part as the browser reports it: the ETag header the bucket answered the PUT with. */
export type CompletedPart = { partNumber: number; etag: string }

export type DownloadOptions = {
  expiresInSeconds: number
  /** Forced on the response, whatever the object's own metadata says. */
  contentType: string
  contentDisposition: string
}

/**
 * Why a storage call failed in a way the caller should answer. `invalid_parts`: a part is
 * missing, too small, or its ETag doesn't match; `no_such_upload`: the multipart upload is gone
 * (completed or aborted already); `not_found`: no object at that key.
 */
export type StorageErrorKind = 'invalid_parts' | 'no_such_upload' | 'not_found'

export class StorageError extends Error {
  constructor(
    readonly kind: StorageErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

export type Storage = {
  readonly driver: 's3' | 'memory'
  createMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string }>
  /**
   * Signing is offline: it never checks the upload still exists (the PUT fails instead).
   * `contentLength` is signed, so the bucket refuses a body of any other size.
   */
  signUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<string>
  completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>
  /** Never throws for an upload that's already gone. */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>
  /** null when there's no object; throws if the bucket answers without a size. */
  head(key: string): Promise<{ sizeBytes: number } | null>
  /** A copy inside the bucket (the bytes never leave it). `not_found` if `from` is missing. */
  copyObject(fromKey: string, toKey: string): Promise<void>
  /** Bytes `start` to `end` inclusive (fewer if the object is shorter). */
  readRange(key: string, start: number, end: number): Promise<Uint8Array>
  /** The whole object as a stream of chunks, read once (hashing). */
  readStream(key: string): Promise<AsyncIterable<Uint8Array>>
  /** Seeds and the storage contract test; uploads from people never go through the API. */
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** Never throws for a missing object. Refuses any key under `kept/` (assertDeletable). */
  deleteObject(key: string): Promise<void>
  /** Also forces `Cache-Control: private, no-store` on the response. */
  signDownload(key: string, options: DownloadOptions): Promise<string>
}

// Key layout (decision 0025). Never a file name or anything personal in a key. Uploads land
// under `incoming/`; attaching a file to a record copies it to `kept/`, which the app never
// deletes (production: bucket lock on `kept/`, and the API's credential has no delete there).

/** Where the browser uploads: `incoming/org/{organizationId}/{fileId}`. */
export function incomingKey(organizationId: string, fileId: string): string {
  return `incoming/org/${organizationId}/${fileId}`
}

/** Where a file a record holds lives: `kept/org/{organizationId}/{fileId}`. */
export function keptKey(organizationId: string, fileId: string): string {
  return `kept/org/${organizationId}/${fileId}`
}

/** A bug that tried to delete a kept file fails loudly instead of losing a title document. */
export function assertDeletable(key: string): void {
  if (!key.startsWith('incoming/')) {
    throw new Error('Only incoming uploads may be deleted')
  }
}
