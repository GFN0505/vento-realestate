import { type RenderedEmail, renderEmail } from './layout'

// Security alerts are always sent and can't be muted (spec, "Behind the scenes").

export function signInLockedAlert(p: {
  reason: 'password' | 'two_step'
  at: string
  on: string
  lockedUntil: string
  resetUrl: string
}): RenderedEmail {
  const what = p.reason === 'two_step' ? '5 wrong codes' : '10 wrong passwords'
  return renderEmail('Vento: sign-in locked for 15 minutes', 'Sign-in locked for 15 minutes', [
    {
      kind: 'p',
      text: `Someone entered ${what} for your Vento account at ${p.at} on ${p.on}. Sign-in is locked until ${p.lockedUntil}. If this wasn't you, reset your password now: ${p.resetUrl}`,
    },
    { kind: 'button', label: 'Reset password', url: p.resetUrl },
  ])
}

export function passwordChangedAlert(p: {
  at: string
  on: string
  resetUrl: string
  viaReset: boolean
}): RenderedEmail {
  return renderEmail('Vento: your password was changed', 'Your password was changed', [
    {
      kind: 'p',
      text: `Your Vento password was ${p.viaReset ? 'reset' : 'changed'} at ${p.at} on ${p.on}.${p.viaReset ? ' You were signed out on your other devices.' : ''}`,
    },
    { kind: 'p', text: `If this wasn't you, reset your password now: ${p.resetUrl}` },
  ])
}

export function twoStepResetAlert(p: { byName: string }): RenderedEmail {
  return renderEmail(
    `Vento: your two-step sign-in was reset by ${p.byName}`,
    'Your two-step sign-in was reset',
    [
      {
        kind: 'p',
        text: `${p.byName} reset two-step sign-in for your Vento account and signed you out everywhere.`,
      },
      {
        kind: 'p',
        text: "To sign in again, set a new password with the link we've just emailed you, then set up two-step with your authenticator app.",
      },
      { kind: 'small', text: `If you didn't ask for this, contact ${p.byName} or another owner.` },
    ],
  )
}

export function twoStepDisabledAlert(p: {
  at: string
  on: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail('Vento: two-step sign-in was turned off', 'Two-step sign-in was turned off', [
    {
      kind: 'p',
      text: `Two-step sign-in was turned off for your Vento account at ${p.at} on ${p.on}.`,
    },
    { kind: 'p', text: `If this wasn't you, reset your password now: ${p.resetUrl}` },
  ])
}

export function backupCodeUsedAlert(p: {
  left: number
  at: string
  on: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail(`Vento: a backup code was used (${p.left} left)`, 'A backup code was used', [
    {
      kind: 'p',
      text: `A backup code was used to sign in to your Vento account at ${p.at} on ${p.on}. You have ${p.left} left.`,
    },
    { kind: 'p', text: `If this wasn't you, reset your password now: ${p.resetUrl}` },
  ])
}
