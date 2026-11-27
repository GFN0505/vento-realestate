import { accountName, email as emailSchema } from '@vento/shared'
import { sendAll } from '@/email/mailer'
import { formatDate } from '@/lib/format'
import { resetEmails } from '../console/super-admins.service'
import {
  inviteSuperAdmin,
  listOpenInvitations,
  previewInvite,
  untilText,
} from '../operations/staff-invitations'
import {
  GRANT_REFUSAL,
  listSuperAdmins,
  previewResetTwoStep,
  previewRevoke,
  resetSuperAdminTwoStep,
  revokeSuperAdmin,
} from '../operations/super-admin'
import { PlatformError } from '../platform-error'
import { authorise, type CommandDeps, confirm, type Parsed, requireReason } from './context'

export const SUPERADMIN_HELP = `Usage: pnpm superadmin <command>
  list
  invite --email <email> --name "…" --break-glass --by <super-admin email> --reason "…"
  invite --bootstrap --email <email> --name "…" [--reason "…"]   only while there are no super-admins
  revoke <email> --break-glass --by <super-admin email> --reason "…"
  reset-two-step <email> --break-glass --by <super-admin email> --reason "…"
Invite, remove and reset super-admins in the Vento Real Estate console; --break-glass is for when it's down.`

const BOOTSTRAP_REASON = 'First super-admin'

/** `--email` and `--name`, checked with the console's own rules. */
function invitee(parsed: Parsed): { email: string; name: string } {
  const email = emailSchema.safeParse(parsed.email ?? '')
  if (!email.success) throw new PlatformError('Add --email with the address to invite.')
  const name = accountName.safeParse(parsed.name ?? '')
  if (!name.success) throw new PlatformError('Add --name with their name (2 to 80 characters).')
  return { email: email.data, name: name.data }
}

async function invite(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const person = invitee(parsed)
  if (parsed.bootstrap) {
    // Only on an empty environment (the operation checks), so it needs no glass. The link is
    // printed: there's nobody to ask yet, and the email may not be set up.
    const reason = requireReason(parsed.reason ?? BOOTSTRAP_REASON)
    const result = await inviteSuperAdmin(deps.db, 'bootstrap', {
      ...person,
      reason,
      operator: deps.operator,
    })
    await sendAll(deps.mailer, result.emails)
    deps.io.print(result.done)
    deps.io.print(`One-time link (works for 48 hours): ${result.link}`)
    return
  }
  const { actor, reason } = await authorise(deps, parsed, 'superadmin invite')
  const preview = await previewInvite(deps.db, person)
  if (!(await confirm(deps, parsed, preview.lines))) return
  const result = await inviteSuperAdmin(deps.db, actor, {
    ...person,
    reason,
    operator: deps.operator,
  })
  // The link is emailed, never printed, so whoever holds the host can't use it. The other
  // super-admins hear of it from the break-glass email, not a second notice.
  await sendAll(
    deps.mailer,
    result.emails.filter((m) => m.tag === 'staff_invitation'),
  )
  deps.io.print(result.done)
}

/** The owner's break-glass reset (27 Nov 2026): the password still works; two-step is set up again. */
async function resetTwoStep(deps: CommandDeps, parsed: Parsed, email: string): Promise<void> {
  const { actor, reason } = await authorise(deps, parsed, 'superadmin reset-two-step')
  const preview = await previewResetTwoStep(deps.db, actor, { email })
  if (!(await confirm(deps, parsed, preview.lines))) return
  const result = await resetSuperAdminTwoStep(deps.db, actor, {
    email,
    reason,
    keepPassword: true,
  })
  // The person gets the security alert; the others the break-glass email.
  const [alert] = await resetEmails(deps.db, actor, result.person, reason, deps.now())
  if (alert) await sendAll(deps.mailer, [alert])
  deps.io.print(`${result.done}. They sign in with their password and set up two-step again.`)
}

export async function superadminCommand(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const [command, email = ''] = parsed.positionals
  if (command === 'list') {
    const admins = await listSuperAdmins(deps.db)
    if (admins.length === 0) {
      deps.io.print('No super-admins yet. Invite the first with invite --bootstrap.')
    }
    for (const a of admins) deps.io.print(`${a.name} <${a.email}> since ${formatDate(a.since)}`)
    const open = await listOpenInvitations(deps.db, deps.now())
    for (const i of open) {
      deps.io.print(`Invited: ${i.name} <${i.email}>, link works until ${untilText(i.expiresAt)}`)
    }
    return
  }
  if (command === 'grant') throw new PlatformError(GRANT_REFUSAL)
  if (command === 'invite') return invite(deps, parsed)
  if (command === 'revoke') {
    const { actor, reason } = await authorise(deps, parsed, 'superadmin revoke')
    const preview = await previewRevoke(deps.db, actor, { email })
    if (!(await confirm(deps, parsed, preview.lines))) return
    deps.io.print(await revokeSuperAdmin(deps.db, actor, { email, reason }))
    return
  }
  if (command === 'reset-two-step') return resetTwoStep(deps, parsed, email)
  deps.io.print(SUPERADMIN_HELP)
}
