import { passwordChangedAlert, twoStepDisabledAlert } from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'
import { recordAccountEvent } from '@/modules/audit/audit.service'
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

export async function onBackupCodesRegenerated(deps: AuthDeps, user: IdentityUser): Promise<void> {
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'two_step.backup_codes_regenerated',
    actor: { userId: user.id, name: user.name },
  })
}
