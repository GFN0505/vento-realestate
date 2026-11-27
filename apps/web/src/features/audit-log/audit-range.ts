import type { AuditSearch } from './audit-search'

const DAY_MS = 86_400_000

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
