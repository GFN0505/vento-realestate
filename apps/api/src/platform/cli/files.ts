import { sweepFiles } from '@/modules/files/sweep'
import { PlatformError } from '../platform-error'
import { requireSuperAdmin } from '../super-admins'
import type { CommandDeps, Parsed } from './context'

export const FILES_HELP = `Usage: pnpm files <command>
  sweep       daily from cron (VENTO_CRON=1): deletes uploads no record took within 24 hours
              (unfinished, refused, or never attached), rows and bytes, retries cancels the
              bucket refused, and removes the incoming copy of attached files; by hand needs
              --by <super-admin email>. Files a record holds (kept/) are never touched.`

/** Daily from the scheduler, like approvals expire; by hand it needs a super-admin's --by. */
async function runSweep(deps: CommandDeps, parsed: Parsed): Promise<void> {
  if (!deps.scheduled) await requireSuperAdmin(deps.db, parsed.by, deps.operator)
  if (!deps.storage) throw new PlatformError('File storage is not configured for this command.')
  const { deleted, incomingCleared, objectsFailed } = await sweepFiles(
    deps.db,
    deps.storage,
    deps.now(),
  )
  const line = `Unused uploads deleted: ${deleted}. Incoming copies of kept files removed: ${incomingCleared}.`
  deps.io.print(
    objectsFailed > 0
      ? `${line} ${objectsFailed} failed and will be retried next run; see the log.`
      : line,
  )
}

export async function filesCommand(deps: CommandDeps, parsed: Parsed): Promise<void> {
  switch (parsed.positionals[0]) {
    case 'sweep':
      return runSweep(deps, parsed)
    default:
      deps.io.print(FILES_HELP)
  }
}
