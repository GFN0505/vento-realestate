import { eq } from 'drizzle-orm'
import { proofIsFresh } from '@/access/console-window'
import { twoFactors } from '@/db/schema'
import { type EmailMessage, sendAll } from '@/email/mailer'
import { superAdminBackupCodesEmail } from '@/email/templates/platform-notices'
import {
  backupCodesRegeneratedAlert,
  passwordChangedAlert,
  twoStepDisabledAlert,
} from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { activeSuperAdmin, otherSuperAdmins } from '@/platform/super-admins'
import { type IdentityUser, rememberCurrentPassword } from '../security-store'
import { type AuthDeps, sendEmail, webUrl } from './deps'

// Account changes made through Better Auth endpoints: written after Better Auth commits.

function stamp() {
  const now = new Date()
  return { at: formatTime(now), on: formatDate(now), resetUrl: webUrl('/forgot-password') }
}

export async function onPasswordChanged(
  deps: AuthDeps,
  user: IdentityUser,
  via: 'reset' | 'change',
): Promise<void> {
  await rememberCurrentPassword(deps.db, user.id)
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: via === 'reset' ? 'account.password_reset' : 'account.password_changed',
    actor: { userId: user.id, name: user.name },
  })
  await sendEmail(
    deps,
    user.email,
    'security_alert',
    passwordChangedAlert({ ...stamp(), viaReset: via === 'reset' }),
  )
}

export async function onTwoStepDisabled(deps: AuthDeps, user: IdentityUser): Promise<void> {
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'two_step.disabled',
    actor: { userId: user.id, name: user.name },
  })
  await sendEmail(deps, user.email, 'security_alert', twoStepDisabledAlert(stamp()))
}

/**
 * New backup codes: audited and emailed to the person; for a Vento super-admin, the other
 * super-admins are told too. Codes made without a fresh code or passkey are marked, so they can't
 * open the console (audit H1).
 */
export async function onBackupCodesRegenerated(
  deps: AuthDeps,
  user: IdentityUser,
  session: { secondFactorAt: Date | null },
): Promise<void> {
  const now = new Date()
  await deps.db
    .update(twoFactors)
    .set({ backupCodesUnprovenAt: proofIsFresh(session, now) ? null : now })
    .where(eq(twoFactors.userId, user.id))
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'two_step.backup_codes_regenerated',
    actor: { userId: user.id, name: user.name },
  })
  const at = formatTime(now)
  const on = formatDate(now)
  const messages: EmailMessage[] = [
    {
      to: user.email,
      tag: 'security_alert',
      ...backupCodesRegeneratedAlert({ at, on, resetUrl: webUrl('/forgot-password') }),
    },
  ]
  if (await activeSuperAdmin(deps.db, user.id)) {
    const notice = superAdminBackupCodesEmail({
      name: user.name,
      at: `${at} on ${on}`,
      activityUrl: webUrl('/console/activity'),
    })
    for (const other of await otherSuperAdmins(deps.db, [user.id])) {
      messages.push({ to: other.email, tag: 'platform_notice', ...notice })
    }
  }
  await sendAll(deps.mailer, messages)
}
