import type { AuditModule } from '@vento/shared'
import { dateParam, matching, oneOf, pageParam, textParam, uuidParam } from '@/lib/search-params'

/*
 * The audit log's address: `/settings/audit-log?q=finance&module=settings&person=<user id>
 * &company=<id>&from=2026-11-01&to=2026-11-27&page=2&open=<entry id>`. Hand-written and small:
 * search validation runs in the entry bundle (the range and request live in audit-range.ts). Without dates the log shows the last
 * 7 days (Lagos). `company` is the Company filter: the page is organization-wide and ignores the
 * top bar's. The module is checked by shape here (the list lives beside zod); the page drops an
 * unknown one.
 */

export type AuditSearch = {
  q?: string
  module?: AuditModule
  person?: string
  company?: string
  from?: string
  to?: string
  /** **View history** on a role or member: that record's own entries, named by `about`. */
  target?: (typeof TARGETS)[number]
  targetId?: string
  about?: string
  page?: number
  open?: string
}

const TARGETS = ['role', 'member', 'user', 'entity', 'invitation', 'organization'] as const

export function validateAuditSearch(search: Record<string, unknown>): AuditSearch {
  const targetId = uuidParam(search.targetId)
  const target = targetId ? oneOf(search.target, TARGETS) : undefined
  return {
    q: textParam(search.q, 100),
    module: matching(search.module, /^[a-z_]{2,24}$/) as AuditModule | undefined,
    person: uuidParam(search.person),
    company: uuidParam(search.company),
    from: dateParam(search.from),
    to: dateParam(search.to),
    target,
    targetId: target && targetId,
    about: target && textParam(search.about, 80),
    page: pageParam(search.page),
    open: uuidParam(search.open),
  }
}
