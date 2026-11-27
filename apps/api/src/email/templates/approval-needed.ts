import { APPROVAL_COPY, type ApprovalChange } from '@vento/shared'
import { type RenderedEmail, renderEmail } from './layout'

/** Rows of the change shown in the email; the rest is in Vento Real Estate. */
const MAX_CHANGES = 8

/**
 * "Approval needed" to every person who can approve the step, when it reaches them (EmailApproval
 * board). Approving happens only in the app: there is no approve link, only Review.
 */
export function approvalNeededEmail(p: {
  organizationName: string
  makerName: string
  /** "Site engineer: permissions". */
  title: string
  /** "₦23,520,000", or null for actions without an amount. */
  amountText: string | null
  reason: string
  changes: readonly ApprovalChange[]
  /** "Aisha Bello (step 1)", when earlier steps were approved. */
  approvedSoFar: readonly string[]
  url: string
}): RenderedEmail {
  const subject = `Approval needed: ${p.title}${p.amountText ? ` · ${p.amountText}` : ''}`
  const shown = p.changes.slice(0, MAX_CHANGES)
  const more = p.changes.length - shown.length
  return renderEmail(subject, `Approval needed: ${p.title}`, [
    {
      kind: 'p',
      text: `${p.makerName} asked for approval in ${p.organizationName}: ${p.title}${p.amountText ? `, ${p.amountText}` : ''}.`,
    },
    { kind: 'p', text: `Their reason: “${p.reason}”` },
    ...shown.map((c) => ({
      kind: 'p' as const,
      text: `${c.field}: ${c.before ?? '—'} → ${c.after ?? '—'}`,
    })),
    ...(more > 0
      ? [{ kind: 'p' as const, text: `And ${more} more ${more === 1 ? 'change' : 'changes'}.` }]
      : []),
    ...(p.approvedSoFar.length
      ? [{ kind: 'p' as const, text: `Approved so far: ${p.approvedSoFar.join(', ')}.` }]
      : []),
    { kind: 'button', label: 'Review in Vento Real Estate', url: p.url },
    { kind: 'small', text: APPROVAL_COPY.emailSecurity },
  ])
}
