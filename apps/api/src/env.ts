import { z } from 'zod'
import { loadLocalEnvFile } from './lib/repo-root'

// Local runs read the repo-root .env. In production the host injects variables and no file is read.
if (process.env.NODE_ENV !== 'production') loadLocalEnvFile(import.meta.dirname)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type Env = z.infer<typeof envSchema>

// Fail fast at startup with a readable list instead of failing later on first use.
const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
  console.error(`Invalid environment variables (see .env.example):\n${problems.join('\n')}`)
  process.exit(1)
}

export const env: Env = parsed.data
