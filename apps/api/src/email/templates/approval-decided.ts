import { type RenderedEmail, renderEmail } from './layout'

/**
 * "Your request was decided", to the maker: "Approved: …" or "Rejected: … · “comment”". Nothing is
 * sent on expiry or cancel; the maker sees those in My requests.
 */
export function approvalDecidedEmail(p: {
  title: string
  decision: 'approve' | 'reject'
  deciderName: string
  comment: string | null
  url: string
}): RenderedEmail {
  if (p.decision === 'approve') {
    const subject = `Approved: ${p.title}`
    return renderEmail(subject, subject, [
      { kind: 'p', text: `${p.deciderName} approved your request. The change has been made.` },
      ...(p.comment ? [{ kind: 'p' as const, text: `Their comment: “${p.comment}”` }] : []),
      { kind: 'button', label: 'Open in Vento Real Estate', url: p.url },
    ])
  }
  const subject = `Rejected: ${p.title}${p.comment ? ` · “${p.comment}”` : ''}`
  return renderEmail(subject, `Rejected: ${p.title}`, [
    { kind: 'p', text: `${p.deciderName} rejected your request. Nothing was changed.` },
    ...(p.comment ? [{ kind: 'p' as const, text: `Their comment: “${p.comment}”` }] : []),
    { kind: 'button', label: 'Open in Vento Real Estate', url: p.url },
  ])
}
