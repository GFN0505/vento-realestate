import { accountName, email as emailSchema } from '@vento/shared'
import { webUrl } from '@/auth/hooks/deps'
import { type EmailMessage, sendAll } from '@/email/mailer'
import { superAdminsChangedEmail } from '@/email/templates/platform-notices'
import { env } from '@/env'
import { formatDate, formatTime } from '@/lib/format'
import { logger } from '@/lib/logger'
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
import type { PlatformActor } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { otherSuperAdmins } from '../super-admins'
import { authorise, type CommandDeps, confirm, type Parsed, requireReason } from './context'

export const SUPERADMIN_HELP = `Usage: pnpm superadmin <command>
  list
  invite --email <email> --name "…" --break-glass --by <super-admin email> --reason "…"
  invite --bootstrap --email <email> --name "…" [--reason "…"] [--print-link]   only while there are no super-admins
  revoke <email> --break-glass --by <super-admin email> --reason "…"
  reset-two-step <email> --break-glass --by <super-admin email> --reason "…"
Invite, remove and reset super-admins in the Vento Real Estate console; --break-glass is for when it's down.`

const BOOTSTRAP_REASON = 'First super-admin'

/** SECURITY_ALERT_EMAIL, or the test's override. */
function securityInbox(deps: CommandDeps): string | null {
  const value =
    deps.securityAlertEmail === undefined ? env.SECURITY_ALERT_EMAIL : deps.securityAlertEmail
  return value ?? null
}

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
    // emailed, and the security inbox is told; it's printed only when asked, since terminal
    // output may be logged (audit L8).
    const reason = requireReason(parsed.reason ?? BOOTSTRAP_REASON)
    const result = await inviteSuperAdmin(deps.db, 'bootstrap', {
      ...person,
      reason,
      operator: deps.operator,
      securityInbox: securityInbox(deps),
    })
    await sendAll(deps.mailer, result.emails)
    deps.io.print(`${result.done}. The link is emailed to ${person.email} and works for 48 hours.`)
    if (parsed.printLink) {
      deps.io.error(
        'Warning: this one-time link opens a super-admin sign-up. Anyone who sees it (terminal history, logs) can use it.',
      )
      deps.io.print(`One-time link (works for 48 hours): ${result.link}`)
    }
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

/**
 * The owner's break-glass reset (27 Nov 2026), your own included (a lone super-admin who lost
 * phone and backup codes), never in the console. Like the console's reset, sign-in then needs a
 * new password from the emailed link: the inbox is the proof, a password alone never gets back in
 * (audit M1). Two-step is set up again before the console opens.
 */
async function resetTwoStep(deps: CommandDeps, parsed: Parsed, email: string): Promise<void> {
  const { actor, reason } = await authorise(deps, parsed, 'superadmin reset-two-step')
  const preview = await previewResetTwoStep(deps.db, actor, { email }, { allowSelf: true })
  if (!(await confirm(deps, parsed, preview.lines))) return
  const result = await resetSuperAdminTwoStep(deps.db, actor, { email, reason, allowSelf: true })
  // The person gets the security alert; the others the break-glass email (break-glass.ts).
  const [alert] = await resetEmails(deps.db, actor, result.person, reason, deps.now())
  const messages: EmailMessage[] = alert ? [alert] : []
  if (result.self) messages.push(...(await selfResetSecurityNotice(deps, actor, reason)))
  await sendAll(deps.mailer, messages)
  const sent = await sendPasswordLink(deps, result.person.email)
  deps.io.print(
    result.self
      ? `${result.done}. Open the link we emailed to ${result.person.email}, set a new password, then set up two-step again before the console opens.`
      : `${result.done}. We emailed ${result.person.email} a link to set a new password; then they set up two-step again before the console opens.`,
  )
  if (!sent) {
    deps.io.error(
      'The password link could not be sent. They can use "Forgot password" on the sign-in page.',
    )
  }
}

async function sendPasswordLink(deps: CommandDeps, email: string): Promise<boolean> {
  if (!deps.requestPasswordReset) return false
  try {
    await deps.requestPasswordReset(email)
    return true
  } catch (error) {
    logger.error('Password link after a break-glass reset not sent', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * A self-reset always reaches the security inbox. The break-glass email already goes there when
 * nobody else is told, so this adds it only when there are other super-admins (no duplicate).
 */
async function selfResetSecurityNotice(
  deps: CommandDeps,
  actor: PlatformActor,
  reason: string,
): Promise<EmailMessage[]> {
  const security = securityInbox(deps)
  if (!security) {
    logger.warn('A super-admin reset their own two-step and SECURITY_ALERT_EMAIL is unset')
    return []
  }
  const others = await otherSuperAdmins(deps.db, actor.userId ? [actor.userId] : [])
  if (others.length === 0) return []
  const now = deps.now()
  return [
    {
      to: security,
      tag: 'platform_notice',
      ...superAdminsChangedEmail({
        sentence: `${actor.name} reset their own two-step from the command line`,
        at: `${formatTime(now)} on ${formatDate(now)}`,
        reason,
        activityUrl: webUrl('/console/activity'),
      }),
    },
  ]
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
