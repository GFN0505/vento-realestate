import { type ApprovalSummary, formatAmount } from '@vento/shared'
import { sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import { webUrl } from '@/auth/hooks/deps'
import type { DbOrTx } from '@/db/client'
import type { EmailMessage } from '@/email/mailer'
import { approvalDecidedEmail } from '@/email/templates/approval-decided'
import { approvalNeededEmail } from '@/email/templates/approval-needed'
import { approvalNoApproverEmail } from '@/email/templates/approval-no-approver'
import { formatDate, formatTime } from '@/lib/format'
import { type EligiblePerson, MAX_APPROVER_EMAILS } from './eligibility'

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

/**
 * "A change went ahead without approval" to every active owner but the maker, capped like the
 * approval emails. Built inside the transaction, sent after commit by the caller.
 */
export async function noApproverAlerts(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'organizationName' | 'user'>,
  title: string,
): Promise<EmailMessage[]> {
  const owners = await db.execute<{ email: string }>(sql`
    select u.email from members m
    join roles ro on ro.organization_id = m.organization_id and ro.id = m.role_id
    join users u on u.id = m.user_id
    where m.organization_id = ${ctx.organizationId} and m.status = 'active'
      and ro.key = 'owner' and m.user_id <> ${ctx.user.id}::uuid
    order by u.email
    limit ${MAX_APPROVER_EMAILS}
  `)
  if (owners.rows.length === 0) return []
  const now = new Date()
  const rendered = approvalNoApproverEmail({
    makerName: ctx.user.name,
    organizationName: ctx.organizationName,
    title,
    at: formatTime(now),
    on: formatDate(now),
    url: webUrl('/settings/audit-log'),
  })
  return owners.rows.map((o) => ({ to: o.email, tag: 'approval' as const, ...rendered }))
}
