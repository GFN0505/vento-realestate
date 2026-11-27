import type { AuditFilters, AuditModule, ListAuditInput } from '@vento/shared'

/*
 * The audit log's address: `/settings/audit-log?q=finance&module=settings&person=<user id>
 * &company=<id>&from=2026-11-01&to=2026-11-27&page=2&open=<entry id>`. Hand-written and small:
 * search validation and the loader run in the entry bundle. Without dates the log shows the last
 * 7 days (Lagos). `company` is the Company filter: the page is organization-wide and ignores the
 * top bar's. The module is checked by shape here (the list lives beside zod); the page drops an
 * unknown one.
 */

export type AuditTargetType = 'role' | 'member' | 'user' | 'entity' | 'invitation' | 'organization'

export type AuditSearch = {
  q?: string
  module?: AuditModule
  person?: string
  company?: string
  from?: string
  to?: string
  /** **View history** on a role or member: that record's own entries, named by `about`. */
  target?: AuditTargetType
  targetId?: string
  about?: string
  page?: number
  open?: string
}

export const AUDIT_PAGE_SIZE = 50
const DAY_MS = 86_400_000

const PATTERNS = {
  id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
  module: /^[a-z_]{2,24}$/,
  target: /^(role|member|user|entity|invitation|organization)$/,
}

const match = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : undefined)
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined
const day = (v: unknown) => {
  const d = match(v, PATTERNS.date)
  return d && !Number.isNaN(Date.parse(d)) ? d : undefined
}

export function validateAuditSearch(search: Record<string, unknown>): AuditSearch {
  const page = Number(search.page)
  const targetId = match(search.targetId, PATTERNS.id)
  const target = targetId ? (match(search.target, PATTERNS.target) as AuditTargetType) : undefined
  return {
    q: text(search.q, 100),
    module: match(search.module, PATTERNS.module) as AuditModule | undefined,
    person: match(search.person, PATTERNS.id),
    company: match(search.company, PATTERNS.id),
    from: day(search.from),
    to: day(search.to),
    target,
    targetId: target && targetId,
    about: target && text(search.about, 80),
    page: page > 1 && page < 10_000 && Number.isInteger(page) ? page : undefined,
    open: match(search.open, PATTERNS.id),
  }
}

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
