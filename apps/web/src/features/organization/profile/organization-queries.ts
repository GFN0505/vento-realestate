import { orpc } from '@/lib/orpc'

/** The organization's profile. In the entry with the route's loader: no zod and no copy here. */
export function organizationQuery() {
  return orpc.organization.get.queryOptions({ staleTime: 60_000 })
}

/** The Security card: "Require two-step sign-in for everyone" and who has two-step. */
export function organizationSecurityQuery() {
  return orpc.organization.security.queryOptions({ staleTime: 30_000 })
}
