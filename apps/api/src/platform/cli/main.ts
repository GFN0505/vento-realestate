import { db, pool } from '@/db/client'
import { createMailer } from '@/email/mailer'
import { env } from '@/env'
import { terminalIo } from './io'
import { operatorIdentity } from './operator'
import { runCommand } from './run'

// `pnpm flags …`, `pnpm plans …`, `pnpm superadmin …` (production: node dist/platform/cli/main.mjs
// flags …). Runs where devops grants database access; there is no web endpoint until the console.
const [group = '', ...args] = process.argv.slice(2)
const operator = operatorIdentity()
try {
  process.exitCode = await runCommand(group, args, {
    db,
    io: terminalIo(),
    operator,
    mailer: createMailer(env),
    now: () => new Date(),
    // Set only in the scheduler's environment: lets plans notify-trials run without --by.
    scheduled: process.env.VENTO_CRON === '1',
  })
} finally {
  await pool.end()
}
