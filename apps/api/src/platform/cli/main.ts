import { hostname, userInfo } from 'node:os'
import { db, pool } from '@/db/client'
import { createMailer } from '@/email/mailer'
import { env } from '@/env'
import { terminalIo } from './io'
import { runCommand } from './run'

// `pnpm flags …`, `pnpm plans …`, `pnpm superadmin …` (production: node dist/platform/cli/main.mjs
// flags …). Runs where devops grants database access; there is no web endpoint until the console.
const [group = '', ...args] = process.argv.slice(2)
const operator = `${userInfo().username}@${hostname()}`
try {
  process.exitCode = await runCommand(group, args, {
    db,
    io: terminalIo(),
    operator,
    mailer: createMailer(env),
    now: () => new Date(),
  })
} finally {
  await pool.end()
}
