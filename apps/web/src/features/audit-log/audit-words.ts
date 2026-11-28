import { type AuditRow, OTHER_DETAILS_CHANGED } from '@vento/shared'
import { formatDateTime } from '@/lib/format-more'

const full = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Lagos',
})

/** "25 Nov 14:12", Lagos time (board AuditLog); "25 Nov 2025 14:12" in another year. */
export function whenText(iso: string, now: Date = new Date()): string {
  return formatDateTime(iso, now)
}

/** A phone card's line: who, then what, without saying who twice ("Vento Real Estate moved…"). */
export function whoAndWhat(row: Pick<AuditRow, 'actor' | 'what'>): string {
  return row.what.startsWith(row.actor.name) ? row.what : `${row.actor.name} · ${row.what}`
}

/** "25 Nov 2026, 14:12:05 Lagos time", for the entry sheet. */
export function fullWhenText(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${full.format(d)} Lagos time`
}

/**
 * One field's before → after: "Role: Sales → Finance". "Other details changed" stands alone; a
 * missing side reads "—". Never JSON: the server labels every field or collapses it.
 */
export function changeText(change: AuditRow['changes'][number]): string {
  if (change.label === OTHER_DETAILS_CHANGED && change.before === null && change.after === null) {
    return OTHER_DETAILS_CHANGED
  }
  return `${change.label}: ${change.before ?? '—'} → ${change.after ?? '—'}`
}

/** "Chrome on Mac · 102.89.34.x"; empty for system changes. */
export function whereText(row: Pick<AuditRow, 'device' | 'ipMasked'>): string {
  return [row.device, row.ipMasked].filter(Boolean).join(' · ')
}
