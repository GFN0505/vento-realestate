import { keepPreviousData } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import { type ApprovalsSearch, approvalsListInput } from './approvals-search'

/** One tab's page of requests. In the entry with the route's loader: no zod and no copy here. */
export function approvalsListQuery(search: ApprovalsSearch) {
  return orpc.approvals.list.queryOptions({
    input: approvalsListInput(search),
    // Short: what waits for you changes as others decide.
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  })
}

export function approvalDetailQuery(id: string) {
  return orpc.approvals.get.queryOptions({ input: { id }, staleTime: 15_000 })
}
