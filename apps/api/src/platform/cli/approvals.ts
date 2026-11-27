import { expireDue } from '@/approvals/engine'
import { requireSuperAdmin } from '../super-admins'
import type { CommandDeps, Parsed } from './context'

export const APPROVALS_HELP = `Usage: pnpm approvals <command>
  expire      daily from cron (VENTO_CRON=1): approval requests past their 7 days become expired;
              by hand needs --by <super-admin email>
Expiry is also applied whenever a request is read or decided, so this is only a tidy-up.`

/** Daily from the scheduler, like plans notify-trials; by hand it needs a super-admin's --by. */
async function runExpire(deps: CommandDeps, parsed: Parsed): Promise<void> {
  if (!deps.scheduled) await requireSuperAdmin(deps.db, parsed.by, deps.operator)
  const expired = await expireDue(deps.db, deps.now())
  deps.io.print(`Approval requests expired: ${expired}.`)
}

export async function approvalsCommand(deps: CommandDeps, parsed: Parsed): Promise<void> {
  switch (parsed.positionals[0]) {
    case 'expire':
      return runExpire(deps, parsed)
    default:
      deps.io.print(APPROVALS_HELP)
  }
}
