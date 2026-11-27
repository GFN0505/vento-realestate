import { orpc } from '@/lib/orpc'

/** Every action with its rules, chains and gaps. In the entry with the loader: no zod here. */
export function approvalRulesQuery() {
  return orpc.approvalRules.list.queryOptions({ staleTime: 60_000 })
}
