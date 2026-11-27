import { type RenderedEmail, renderEmail } from './layout'

/**
 * To every other active owner when a guarded action went ahead because nobody else could approve
 * it (security M1): an approval rule applied, but the chain had a step nobody could take.
 */
export function approvalNoApproverEmail(p: {
  makerName: string
  organizationName: string
  /** The change, as the request would have named it: "Make Aisha Bello an owner". */
  title: string
  at: string
  on: string
  url: string
}): RenderedEmail {
  const subject = `Vento Real Estate: a change went ahead without approval in ${p.organizationName}`
  return renderEmail(subject, 'A change went ahead without approval', [
    {
      kind: 'p',
      text: `${p.makerName} made this change in ${p.organizationName} at ${p.at} on ${p.on}: ${p.title}.`,
    },
    {
      kind: 'p',
      text: 'An approval rule covers it, but nobody else could approve it, so it went ahead. The audit log marks it “No one else could approve this”.',
    },
    { kind: 'button', label: 'Open the audit log', url: p.url },
    {
      kind: 'small',
      text: "You're getting this because you're an owner. If you didn't expect this change, talk to the other owners and add an approver to the rule.",
    },
  ])
}
