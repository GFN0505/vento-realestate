import { formatDate } from '@/lib/format'
import {
  grantSuperAdmin,
  listSuperAdmins,
  previewGrant,
  previewRevoke,
  revokeSuperAdmin,
} from '../operations/super-admin'
import { requireSuperAdmin } from '../super-admins'
import { authorise, type CommandDeps, confirm, type Parsed, requireReason } from './context'

export const SUPERADMIN_HELP = `Usage: pnpm superadmin <command>
  list
  grant <email> --by <super-admin email> --reason "…"
  grant <email> --bootstrap --reason "…"     only while there are no super-admins
  revoke <email> --by <super-admin email> --reason "…"`

export async function superadminCommand(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const [command, email = ''] = parsed.positionals
  if (command === 'list') {
    const admins = await listSuperAdmins(deps.db)
    if (admins.length === 0) deps.io.print('No super-admins yet. Grant the first with --bootstrap.')
    for (const a of admins) deps.io.print(`${a.name} <${a.email}> since ${formatDate(a.since)}`)
    return
  }
  if (command === 'grant') {
    const reason = requireReason(parsed.reason)
    const actor = parsed.bootstrap
      ? ('bootstrap' as const)
      : await requireSuperAdmin(deps.db, parsed.by, deps.operator)
    const preview = await previewGrant(deps.db, { email })
    if (!(await confirm(deps, parsed, preview.lines))) return
    deps.io.print(await grantSuperAdmin(deps.db, actor, { email, reason, operator: deps.operator }))
    return
  }
  if (command === 'revoke') {
    const { actor, reason } = await authorise(deps, parsed)
    const preview = await previewRevoke(deps.db, actor, { email })
    if (!(await confirm(deps, parsed, preview.lines))) return
    deps.io.print(await revokeSuperAdmin(deps.db, actor, { email, reason }))
    return
  }
  deps.io.print(SUPERADMIN_HELP)
}
