import { orpc } from '@/lib/orpc'

/** The organization's profile. In the entry with the route's loader: no zod and no copy here. */
export function organizationQuery() {
  return orpc.organization.get.queryOptions({ staleTime: 60_000 })
}
