import { createAuth } from '@/auth/auth'
import { db, pool } from '@/db/client'
import { createMailer } from '@/email/mailer'
import { env } from '@/env'
import { requestScope, runWithRequestScope } from '@/lib/request-scope'
import { createStorage } from '@/storage'
import { terminalIo } from './io'
import { operatorIdentity } from './operator'
import { runCommand } from './run'

// `pnpm flags …`, `pnpm plans …`, `pnpm superadmin …`, `pnpm approvals …`, `pnpm files …` (production: node
// dist/platform/cli/main.mjs flags …). Runs where devops grants database access; there is no web endpoint until the console.
const [group = '', ...args] = process.argv.slice(2)
const operator = operatorIdentity()
const mailer = createMailer(env)
const auth = createAuth({ db, mailer })

/** A super-admin's reset: Better Auth's own single-use link, outside the inbox's hourly cap. */
async function requestPasswordReset(email: string): Promise<void> {
  const scope = { ...requestScope(), requestId: 'cli', auth: { adminResetLink: true } }
  await runWithRequestScope(scope, () =>
    auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } }),
  )
}

try {
  process.exitCode = await runCommand(group, args, {
    db,
    io: terminalIo(),
    operator,
    mailer,
    storage: createStorage(env),
    requestPasswordReset,
    now: () => new Date(),
    // Set only in the scheduler's environment: lets plans notify-trials, approvals expire and
    // files sweep run without --by.
    scheduled: process.env.VENTO_CRON === '1',
  })
} finally {
  await pool.end()
}
