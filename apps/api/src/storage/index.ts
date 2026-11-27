import type { Env } from '@/env'
import type { Storage } from './driver'
import { LOCAL_S3, localCredentialProblems } from './local'
import { createMemoryStorage } from './memory-driver'
import { createS3Storage, type S3Config } from './s3-driver'

export type { CompletedPart, Storage } from './driver'
export { incomingKey, keptKey, StorageError } from './driver'
export { LOCAL_S3 } from './local'

type StorageEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'STORAGE_DRIVER'
  | 'S3_ENDPOINT'
  | 'S3_REGION'
  | 'S3_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_FORCE_PATH_STYLE'
>

/**
 * The bucket settings: the environment's, with the local container's for anything unset outside
 * production. In production an empty S3_ENDPOINT means AWS's own endpoint for the region.
 */
export function s3ConfigFrom(config: StorageEnv): S3Config {
  const local = config.NODE_ENV !== 'production'
  return {
    endpoint: config.S3_ENDPOINT ?? (local ? LOCAL_S3.endpoint : undefined),
    region: config.S3_REGION ?? LOCAL_S3.region,
    bucket: config.S3_BUCKET ?? (local ? LOCAL_S3.bucket : ''),
    accessKeyId: config.S3_ACCESS_KEY_ID ?? (local ? LOCAL_S3.accessKeyId : ''),
    secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? (local ? LOCAL_S3.secretAccessKey : ''),
    forcePathStyle: config.S3_FORCE_PATH_STYLE
      ? config.S3_FORCE_PATH_STYLE === 'true'
      : LOCAL_S3.forcePathStyle,
  }
}

/** Nothing connects until the first call, so creating it never fails on a stopped container. */
export function createStorage(config: StorageEnv): Storage {
  if (config.STORAGE_DRIVER === 'memory') {
    // env.ts already refuses this; a second guard costs nothing.
    if (config.NODE_ENV === 'production') {
      throw new Error('Production needs a real bucket; the memory storage driver is for tests')
    }
    return createMemoryStorage()
  }
  // env.ts refuses these too; this covers anything that builds a config another way.
  if (config.NODE_ENV === 'production' && localCredentialProblems(config).length > 0) {
    throw new Error('Production needs the bucket’s own credentials, not the local placeholders')
  }
  return createS3Storage(s3ConfigFrom(config))
}
