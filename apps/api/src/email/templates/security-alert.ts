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

/** To every owner, the new one included, whenever someone becomes an owner. Can't be muted. */
export function newOwnerAlert(p: {
  byName: string
  newOwnerName: string
  organizationName: string
  at: string
  on: string
  teamUrl: string
}): RenderedEmail {
  return renderEmail(
    `Vento: ${p.newOwnerName} is now an owner of ${p.organizationName}`,
    `${p.newOwnerName} is now an owner`,
    [
      {
        kind: 'p',
        text: `${p.byName} made ${p.newOwnerName} an owner of ${p.organizationName} at ${p.at} on ${p.on}. Owners can do everything, including changing who has access.`,
      },
      { kind: 'p', text: `If this wasn't expected, sign in and check Team: ${p.teamUrl}` },
      { kind: 'button', label: 'Check Team', url: p.teamUrl },
    ],
  )
}

/** A sign-in from a browser not seen on this account in 90 days. Never includes an IP address. */
export function newSignInAlert(p: {
  device: string
  place: string | null
  at: string
  on: string
  securityUrl: string
}): RenderedEmail {
  const near = p.place ? `, near ${p.place}` : ''
  return renderEmail(`Vento: new sign-in on ${p.device}`, 'New sign-in to your account', [
    {
      kind: 'p',
      text: `Your Vento account was signed in to at ${p.at} on ${p.on} from ${p.device}${near}. If this was you, there's nothing to do. If it wasn't, reset your password and sign that device out: ${p.securityUrl}`,
    },
    { kind: 'button', label: 'Check My security', url: p.securityUrl },
  ])
}

export function passkeyAddedAlert(p: {
  name: string
  at: string
  on: string
  securityUrl: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail('Vento: a passkey was added to your account', 'A passkey was added', [
    {
      kind: 'p',
      text: `A passkey (${p.name}) was added at ${p.at} on ${p.on}. It can sign in to your account without a password. If this wasn't you, remove it and reset your password: ${p.resetUrl}`,
    },
    { kind: 'button', label: 'Check My security', url: p.securityUrl },
  ])
}

export function passkeyRemovedAlert(p: {
  name: string
  at: string
  on: string
  securityUrl: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail('Vento: a passkey was removed from your account', 'A passkey was removed', [
    {
      kind: 'p',
      text: `The passkey ${p.name} was removed at ${p.at} on ${p.on}. If this wasn't you, reset your password now: ${p.resetUrl}`,
    },
    { kind: 'button', label: 'Check My security', url: p.securityUrl },
  ])
}

/** To every owner when "Require two-step sign-in for everyone" is turned off. */
export function twoStepNoLongerRequiredAlert(p: {
  byName: string
  organizationName: string
  at: string
  on: string
  organizationUrl: string
}): RenderedEmail {
  return renderEmail(
    `Vento: two-step is no longer required for everyone in ${p.organizationName}`,
    'Two-step is no longer required for everyone',
    [
      {
        kind: 'p',
        text: `${p.byName} turned off "Require two-step sign-in for everyone" at ${p.at} on ${p.on}. Owners, admins, finance and HR still need it. If this wasn't expected, check Organization: ${p.organizationUrl}`,
      },
      { kind: 'button', label: 'Check Organization', url: p.organizationUrl },
    ],
  )
}

/** A passkey answered with a counter that went backwards: someone may have copied it. */
export function passkeyCopiedAlert(p: {
  name: string
  at: string
  on: string
  securityUrl: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail('Vento: a passkey may have been copied', 'A passkey may have been copied', [
    {
      kind: 'p',
      text: `At ${p.at} on ${p.on} someone tried to sign in with your passkey ${p.name}, but it looked like a copy of the key, so we refused it. If you didn't just sign in on two devices at once, remove this passkey and reset your password: ${p.resetUrl}`,
    },
    { kind: 'button', label: 'Check My security', url: p.securityUrl },
  ])
}

/** New backup codes replace the old ones: said at once, since they can sign in instead of a code. */
export function backupCodesRegeneratedAlert(p: {
  at: string
  on: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail('Vento: new backup codes were made', 'New backup codes were made', [
    {
      kind: 'p',
      text: `New backup codes were made for your Vento account at ${p.at} on ${p.on}. Your old codes no longer work.`,
    },
    { kind: 'p', text: `If this wasn't you, reset your password now: ${p.resetUrl}` },
  ])
}
