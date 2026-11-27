import type { S3Config } from './s3-driver'

/**
 * The S3-compatible container `pnpm db:up` starts (docker-compose.yml). Local placeholders,
 * like the database's vento:vento; production refuses these keys (env.ts, createStorage).
 * Its own file so env.ts can read it without loading the AWS SDK.
 */
export const LOCAL_S3 = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'vento-local',
  accessKeyId: 'vento',
  secretAccessKey: 'vento-local-secret',
  forcePathStyle: true,
} as const satisfies S3Config

/** The production refusals for credentials that are the local container's placeholders. */
export function localCredentialProblems(config: {
  S3_ACCESS_KEY_ID?: string | undefined
  S3_SECRET_ACCESS_KEY?: string | undefined
}): string[] {
  const problems: string[] = []
  if (config.S3_ACCESS_KEY_ID === LOCAL_S3.accessKeyId) {
    problems.push('S3_ACCESS_KEY_ID: Use the bucket’s own key, not the local placeholder')
  }
  if (config.S3_SECRET_ACCESS_KEY === LOCAL_S3.secretAccessKey) {
    problems.push('S3_SECRET_ACCESS_KEY: Use the bucket’s own secret, not the local placeholder')
  }
  return problems
}
