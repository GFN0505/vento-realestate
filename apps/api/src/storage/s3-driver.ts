import { Readable } from 'node:stream'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { assertDeletable, type Storage, StorageError } from './driver'

export type S3Config = {
  endpoint: string | undefined
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
  /** Milliseconds; the defaults below unless a test needs them short. */
  timeouts?: { connectionTimeout: number; requestTimeout: number }
}

const INVALID_PARTS = new Set(['InvalidPart', 'InvalidPartOrder', 'EntityTooSmall'])

function errorName(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'name' in error
    ? String((error as { name: unknown }).name)
    : undefined
}

function statusOf(error: unknown): number | undefined {
  const meta = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
  return meta?.httpStatusCode
}

const isNotFound = (error: unknown) =>
  errorName(error) === 'NotFound' || errorName(error) === 'NoSuchKey' || statusOf(error) === 404

/** Links are for one person's browser: never kept by a shared cache or the browser's disk. */
const NO_STORE = 'private, no-store'

/**
 * A hung bucket must not hold a request (or the sweep) for ever. requestTimeout bounds the wait
 * for the bucket's answer, not the body, so streaming a 25 MB file for its hash is never cut
 * off. Without throwOnRequestTimeout this SDK only logs a warning and keeps waiting.
 */
const TIMEOUTS = { connectionTimeout: 5_000, requestTimeout: 30_000 }

export function createS3Storage(config: S3Config): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Plain S3 only: the SDK's default checksums put x-amz-checksum-* into presigned part URLs,
    // which browsers then can't satisfy and R2 or MinIO may reject.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { ...(config.timeouts ?? TIMEOUTS), throwOnRequestTimeout: true },
  })
  const Bucket = config.bucket

  return {
    driver: 's3',

    async createMultipartUpload(key, contentType) {
      const out = await client.send(
        new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }),
      )
      if (!out.UploadId) throw new Error('The bucket returned no upload id')
      return { uploadId: out.UploadId }
    },

    signUploadPart(key, uploadId, partNumber, contentLength, expiresInSeconds) {
      return getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          ContentLength: contentLength,
        }),
        // Signed, so a body of any other size is refused: nobody can park more than declared.
        { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-length']) },
      )
    },

    async completeMultipartUpload(key, uploadId, parts) {
      try {
        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
              Parts: [...parts]
                .sort((a, b) => a.partNumber - b.partNumber)
                .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
            },
          }),
        )
      } catch (error) {
        const name = errorName(error)
        if (name === 'NoSuchUpload') throw new StorageError('no_such_upload', 'Upload is gone')
        if (name && INVALID_PARTS.has(name)) throw new StorageError('invalid_parts', name)
        throw error
      }
    },

    async abortMultipartUpload(key, uploadId) {
      try {
        await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }))
      } catch (error) {
        if (errorName(error) !== 'NoSuchUpload' && !isNotFound(error)) throw error
      }
    },

    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        if (out.ContentLength === undefined) throw new Error('The bucket returned no size')
        return { sizeBytes: Number(out.ContentLength) }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    async copyObject(fromKey, toKey) {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket,
            Key: toKey,
            CopySource: `${Bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`,
          }),
        )
      } catch (error) {
        if (isNotFound(error)) throw new StorageError('not_found', 'No such object')
        throw error
      }
    },

    async readRange(key, start, end) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket, Key: key, Range: `bytes=${start}-${end}` }),
        )
        if (!out.Body) return new Uint8Array()
        return await out.Body.transformToByteArray()
      } catch (error) {
        if (isNotFound(error)) throw new StorageError('not_found', 'No such object')
        throw error
      }
    },

    async readStream(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }))
        // In Node the SDK hands back an IncomingMessage, which is a Readable.
        if (!(out.Body instanceof Readable)) throw new Error('Expected a readable body')
        return out.Body
      } catch (error) {
        if (isNotFound(error)) throw new StorageError('not_found', 'No such object')
        throw error
      }
    },

    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },

    async deleteObject(key) {
      assertDeletable(key)
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },

    signDownload(key, options) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentType: options.contentType,
          ResponseContentDisposition: options.contentDisposition,
          ResponseCacheControl: NO_STORE,
        }),
        { expiresIn: options.expiresInSeconds },
      )
    },
  }
}
