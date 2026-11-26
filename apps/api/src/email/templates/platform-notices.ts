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
