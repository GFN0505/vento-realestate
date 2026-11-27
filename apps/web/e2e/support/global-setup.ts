import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expireStaffInvitations, publishPlans } from './fixtures'

const repoRoot = join(import.meta.dirname, '..', '..', '..', '..')

/**
 * Self-signed-up organizations land on Starter, so the plans must exist before any spec runs.
 * The dev mailbox is trimmed here, before specs read codes from it, never during the run.
 */
export default function globalSetup() {
  execFileSync('pnpm', ['--filter', '@vento/api', 'exec', 'tsx', 'src/scripts/prune-mail.ts'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'ignore',
  })
  publishPlans()
  // The cap of 5 open staff invitations is global: start without earlier runs' leftovers.
  expireStaffInvitations()
}
