import {
  type ApprovalAmount,
  type ApprovalRequestRow,
  type ApprovalRequestStep,
  formatAmount,
} from '@vento/shared'
import { formatDate } from '@/lib/format'

// Plain words for the inbox, kept pure so they're tested without rendering.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "35 min ago", "2 h ago", "3 days ago", then "25 Nov 2026". */
export function ageText(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < MINUTE) return 'just now'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`
  if (ms < 7 * DAY) {
    const days = Math.floor(ms / DAY)
    return days === 1 ? 'yesterday' : `${days} days ago`
  }
  return formatDate(iso)
}

/** "35 minutes ago" for screen readers, which read "min" and "h" badly. */
export function spokenAge(iso: string, now: Date = new Date()): string {
  return ageText(iso, now).replace(/ min /, ' minutes ').replace(/ h /, ' hours ')
}

/** "₦23,520,000", with "≈ ₦…" for a foreign amount (ux-writing: NGN beside foreign money). */
export function amountText(amount: ApprovalAmount): { main: string; ngn: string | null } {
  const main = formatAmount(amount.value, amount.currency)
  const ngn = amount.currency === 'NGN' ? null : `≈ ${formatAmount(amount.ngnValue, 'NGN')}`
  return { main, ngn }
}

export type StateTone = 'amber' | 'emerald' | 'rose' | 'slate'

/** Where a request stands, for My requests and Decided (spec). */
export function requestState(
  row: Pick<ApprovalRequestRow, 'status' | 'waitingFor' | 'lastDecision' | 'endedReason'>,
): { label: string; tone: StateTone } {
  switch (row.status) {
    case 'pending':
      return { label: `Waiting for ${row.waitingFor ?? 'approval'}`, tone: 'amber' }
    case 'approved':
      return {
        label: row.lastDecision ? `Approved by ${row.lastDecision.name}` : 'Approved',
        tone: 'emerald',
      }
    case 'rejected':
      return {
        label: row.lastDecision?.comment ? `Rejected: “${row.lastDecision.comment}”` : 'Rejected',
        tone: 'rose',
      }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'slate' }
    case 'expired':
      return { label: 'Expired', tone: 'slate' }
  }
}

/** One step of the chain, in words a screen reader can read as a sentence. */
export function stepWords(
  step: ApprovalRequestStep,
  now: Date = new Date(),
): { title: string; meta: string; spoken: string } {
  const d = step.decision
  if (d && (step.state === 'approved' || step.state === 'rejected')) {
    const verb = step.state === 'approved' ? 'approved' : 'rejected'
    return {
      title: `${step.text} — ${d.memberName}`,
      meta: ageText(d.decidedAt, now),
      spoken: `${step.text}, ${verb} by ${d.memberName}, ${spokenAge(d.decidedAt, now)}`,
    }
  }
  if (step.state === 'waiting') {
    return {
      title: step.isYou ? `${step.text} — you` : step.text,
      meta: 'Waiting',
      spoken: `${step.text}, waiting${step.isYou ? ' for you' : ''}`,
    }
  }
  if (step.state === 'upcoming') {
    return { title: step.text, meta: 'Next', spoken: `${step.text}, after the step before` }
  }
  return { title: step.text, meta: 'Not reached', spoken: `${step.text}, not reached` }
}

/** The comment box's hint: who reads it. */
export function commentPlaceholder(makerName: string): string {
  return `Visible to ${makerName} and kept in the audit log`
}
