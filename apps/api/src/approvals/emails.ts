import { type ApprovalSummary, formatAmount } from '@vento/shared'
import { webUrl } from '@/auth/hooks/deps'
import type { EmailMessage } from '@/email/mailer'
import { approvalDecidedEmail } from '@/email/templates/approval-decided'
import { approvalNeededEmail } from '@/email/templates/approval-needed'
import type { EligiblePerson } from './eligibility'

/** The request in the inbox; the web opens it on the right. */
export const requestUrl = (requestId: string): string => webUrl(`/approvals?id=${requestId}`)

function amountText(summary: ApprovalSummary): string | null {
  return summary.amount ? formatAmount(summary.amount.value, summary.amount.currency) : null
}

/** "Approval needed" to each person who can approve the step now (already capped at 50). */
export function approvalNeededMessages(p: {
  organizationName: string
  requestId: string
  makerName: string
  summary: ApprovalSummary
  reason: string
  approvedSoFar: readonly string[]
  to: readonly EligiblePerson[]
}): EmailMessage[] {
  const rendered = approvalNeededEmail({
    organizationName: p.organizationName,
    makerName: p.makerName,
    title: p.summary.title,
    amountText: amountText(p.summary),
    reason: p.reason,
    changes: p.summary.changes,
    approvedSoFar: p.approvedSoFar,
    url: requestUrl(p.requestId),
  })
  return p.to.map((person) => ({ to: person.email, tag: 'approval' as const, ...rendered }))
}

export function approvalDecidedMessage(p: {
  to: string
  requestId: string
  title: string
  decision: 'approve' | 'reject'
  deciderName: string
  comment: string | null
}): EmailMessage {
  return {
    to: p.to,
    tag: 'approval',
    ...approvalDecidedEmail({
      title: p.title,
      decision: p.decision,
      deciderName: p.deciderName,
      comment: p.comment,
      url: webUrl(`/approvals?tab=mine&id=${p.requestId}`),
    }),
  }
}
