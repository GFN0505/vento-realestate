import { type RenderedEmail, renderEmail } from './layout'

// Emails to Vento staff about the super-admin list (admin-console plan §10). Short and factual:
// who did what, when, and where to look.

export function superAdminAddedEmail(p: {
  name: string
  byName: string
  /** "21:14 on 26 Nov 2026". */
  at: string
  consoleUrl: string
}): RenderedEmail {
  const subject = "You're now a Vento super-admin"
  return renderEmail(subject, subject, [
    {
      kind: 'p',
      text: `${p.byName} made you a Vento super-admin at ${p.at}. You can now open the Vento console, which changes plans, features and releases for every customer.`,
    },
    { kind: 'button', label: 'Open the Vento console', url: p.consoleUrl },
    {
      kind: 'small',
      text: "Two-step sign-in must stay on while you're a super-admin. If you didn't expect this, tell the person who added you.",
    },
  ])
}

export function superAdminRemovedEmail(p: { byName: string; at: string }): RenderedEmail {
  const subject = "You're no longer a Vento super-admin"
  return renderEmail(subject, subject, [
    {
      kind: 'p',
      text: `${p.byName} removed you as a Vento super-admin at ${p.at}. Your access to customer organizations hasn't changed.`,
    },
  ])
}

/** To every other super-admin, so a change to the list never goes unseen. */
export function superAdminsChangedEmail(p: {
  /** "Ada Okafor made Tunde Ola a super-admin". */
  sentence: string
  at: string
  reason: string
  activityUrl: string
}): RenderedEmail {
  const subject = `${p.sentence}`
  return renderEmail(subject, subject, [
    { kind: 'p', text: `${p.sentence} at ${p.at}. Reason: ${p.reason}` },
    { kind: 'button', label: 'See the activity', url: p.activityUrl },
    { kind: 'small', text: "If you didn't expect this, check with them." },
  ])
}

/**
 * To every other active super-admin after a change made with --break-glass (admin-console plan
 * §7.1): the console was bypassed, so nobody should learn of it only from the activity page.
 */
export function breakGlassEmail(p: {
  actorName: string
  /** "Moved Sales to off". */
  summary: string
  /** The machine it ran on ("api-1"); null when unknown. */
  host: string | null
  /** "21:14 on 26 Nov 2026". */
  at: string
  reason: string
  activityUrl: string
  /** To the person named by --by: someone with host access may have used their name. */
  toActor?: boolean
}): RenderedEmail {
  const subject = `${p.summary} from the command line`
  const what = p.summary.charAt(0).toLowerCase() + p.summary.slice(1)
  const where = p.host ? ` on ${p.host}` : ''
  if (p.toActor) {
    return renderEmail(subject, subject, [
      {
        kind: 'p',
        text: `This was run as you${where} at ${p.at}: ${what}. Reason: ${p.reason}`,
      },
      {
        kind: 'p',
        text: "If it wasn't you, tell the other super-admins at once and reset your password.",
      },
      { kind: 'button', label: 'Check the activity', url: p.activityUrl },
    ])
  }
  return renderEmail(subject, subject, [
    { kind: 'p', text: `${p.actorName} ${what}${where} at ${p.at}. Reason: ${p.reason}` },
    { kind: 'button', label: 'Check the activity', url: p.activityUrl },
    { kind: 'small', text: "If you didn't expect this, check the Activity page." },
  ])
}

/** To the other super-admins when one of them makes new backup codes (a way into the console). */
export function superAdminBackupCodesEmail(p: {
  name: string
  at: string
  activityUrl: string
}): RenderedEmail {
  const subject = `${p.name} made new backup codes`
  return renderEmail(subject, subject, [
    {
      kind: 'p',
      text: `${p.name}, a Vento super-admin, made new two-step backup codes at ${p.at}. Backup codes can open the Vento console.`,
    },
    { kind: 'small', text: "If you didn't expect this, check with them." },
  ])
}
