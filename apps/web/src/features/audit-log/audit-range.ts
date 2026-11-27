import type { AuditFilters, ListAuditInput } from '@vento/shared'
import type { AuditSearch } from './audit-search'

export const AUDIT_PAGE_SIZE = 50
const DAY_MS = 86_400_000

/** Today in Lagos, as a calendar date. */
export function lagosToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now)
}

/** `isoDate` moved by whole days (UTC calendar arithmetic, so nothing drifts). */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(isoDate) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The range shown: the address's dates, or the last 7 days ending today. */
export function auditRange(search: AuditSearch, now?: Date) {
  const to = search.to ?? lagosToday(now)
  return { from: search.from ?? addDays(to, -6), to }
}

/** The filters as the API takes them (list and export share them). */
export function auditFilters(search: AuditSearch, now?: Date): AuditFilters {
  return {
    ...auditRange(search, now),
    q: search.q,
    module: search.module,
    actorUserId: search.person,
    entityId: search.company,
    targetType: search.target,
    targetId: search.targetId,
  }
}

export function auditListInput(search: AuditSearch, now?: Date): ListAuditInput {
  return { ...auditFilters(search, now), page: search.page ?? 1, pageSize: AUDIT_PAGE_SIZE }
}

/** Why a range can't be searched, in the shared schema's words; null when it's fine. */
export function rangeProblem(range: { from: string; to: string }): string | null {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / DAY_MS
  if (days < 0) return 'Choose an end date after the start date'
  if (days > 366) return 'Choose dates up to a year apart'
  return null
}

/** Anything narrower than "everything in the last 7 days". */
export function hasAuditFilters(search: AuditSearch): boolean {
  return Boolean(
    search.q ||
      search.module ||
      search.person ||
      search.company ||
      search.target ||
      search.from ||
      search.to,
  )
}
