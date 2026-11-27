import { keepPreviousData } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import { auditListInput } from './audit-range'
import type { AuditSearch } from './audit-search'

/** One page of entries, newest first. In the entry with the loader: no zod and no copy here. */
export function auditListQuery(search: AuditSearch) {
  return orpc.audit.list.queryOptions({
    input: auditListInput(search),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** One entry with every field, its approvers and a link to the record. */
export function auditEntryQuery(id: string) {
  return orpc.audit.get.queryOptions({ input: { id }, staleTime: 5 * 60_000 })
}
