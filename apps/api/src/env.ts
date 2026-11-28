import { z } from 'zod'
import { loadLocalEnvFile } from './lib/repo-root'
import { localCredentialProblems } from './storage/local'

// Local runs read the repo-root .env. In production the host injects variables and no file is read.
if (process.env.NODE_ENV !== 'production') loadLocalEnvFile(import.meta.dirname)

const onOff = z.enum(['on', 'off'])
// An empty line in .env (KEY=) means "not set".
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, { message: 'Use at least 32 random characters (openssl rand -base64 32)' }),
  EMAIL_TRANSPORT: z.enum(['dev', 'memory']).default('dev'),
  EMAIL_FROM: z.string().min(3).default('Vento Real Estate <no-reply@localhost>'),
  EMAIL_DEV_DIR: z.string().min(1).default('.mail'),
  AUTH_RATE_LIMIT: onOff.default('on'),
  TRUSTED_IP_HEADER: optionalText.transform((v) => v?.toLowerCase()),
  SEED_PASSWORD: optionalText,
  /** Seconds between reloads of the feature snapshot; changes reach every server within this. */
  FEATURE_SNAPSHOT_REFRESH_SECONDS: z.coerce.number().int().min(1).max(30).default(10),
  /**
   * DB-IP "IP to City Lite" (MMDB) for approximate places on My security (decision 0020).
   * Unset or missing file: no place is shown; sign-in works the same.
   */
  GEOIP_DB_PATH: optionalText,
  /** Break-glass changes are emailed here when no other super-admin can be told (audit M2). */
  SECURITY_ALERT_EMAIL: optionalText.pipe(z.email().optional()),
  /** "Talk to Vento Real Estate" for owners. Required in production. */
  SUPPORT_EMAIL: optionalText.pipe(z.email().optional()),
  /**
   * Private file storage (decision 0025). `s3`: any S3-compatible bucket (local container from
   * `pnpm db:up`; R2 or S3 in production). `memory`: tests only, refused in production. Locally
   * every S3_* value has a default matching the container (storage/index.ts).
   */
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
  /** Empty: the local container outside production; AWS's own endpoint in production. */
  S3_ENDPOINT: optionalText.pipe(z.url({ protocol: /^https?$/ }).optional()),
  S3_REGION: optionalText,
  S3_BUCKET: optionalText,
  S3_ACCESS_KEY_ID: optionalText,
  S3_SECRET_ACCESS_KEY: optionalText,
  /** `true` for MinIO and most S3-compatible stores; R2 and AWS work either way. */
  S3_FORCE_PATH_STYLE: optionalText.pipe(z.enum(['true', 'false']).optional()),
  SUPPORT_WHATSAPP: optionalText.pipe(
    z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, { message: 'Use E.164, e.g. +2348012345678' })
      .optional(),
  ),
})

export type Env = z.infer<typeof envSchema>

// Fail fast at startup with a readable list instead of failing later on first use.
const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
  console.error(`Invalid environment variables (see .env.example):\n${problems.join('\n')}`)
  process.exit(1)
}

// Passkeys (WebAuthn) need a secure context; browsers only exempt localhost (decision 0019).
if (
  parsed.data.NODE_ENV === 'production' &&
  new URL(parsed.data.WEB_ORIGIN).protocol !== 'https:'
) {
  console.error('Invalid environment variables (see .env.example):\n  - WEB_ORIGIN: Use https://')
  process.exit(1)
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.SUPPORT_EMAIL) {
  console.error('Invalid environment variables (see .env.example):\n  - SUPPORT_EMAIL: Required')
  process.exit(1)
}

// Files in memory vanish on restart, and a production bucket must be named, never defaulted.
if (parsed.data.NODE_ENV === 'production') {
  const d = parsed.data
  const missing =
    d.STORAGE_DRIVER === 'memory'
      ? ['STORAGE_DRIVER: Use s3; memory is for tests only']
      : (['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const)
          .filter((k) => !d[k])
          .map((k) => `${k}: Required`)
  if (d.S3_ENDPOINT && !d.S3_ENDPOINT.startsWith('https://'))
    missing.push('S3_ENDPOINT: Use https://')
  if (d.STORAGE_DRIVER === 's3') missing.push(...localCredentialProblems(d))
  if (missing.length > 0) {
    console.error(
      `Invalid environment variables (see .env.example):\n${missing.map((m) => `  - ${m}`).join('\n')}`,
    )
    process.exit(1)
  }
}

export const env: Env = parsed.data

/** Where "Talk to Vento Real Estate" goes. */
export function supportContact(): { email: string; whatsapp: string | null } {
  return { email: env.SUPPORT_EMAIL ?? 'support@localhost', whatsapp: env.SUPPORT_WHATSAPP ?? null }
}
