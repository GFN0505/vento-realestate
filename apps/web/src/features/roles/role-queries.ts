import { orpc } from '@/lib/orpc'

/*
 * One role, for its page. In the entry with the route's loader: no zod and no copy here. The
 * roles list is `rolesQuery` (features/preview), shared with Team, preview and ⌘K.
 */
export function roleQuery(id: string) {
  return orpc.roles.get.queryOptions({ input: { id }, staleTime: 30_000 })
}

/** `?new=1&from=<role id>`: the New role dialog, so Back closes it and ⌘K can open it. */
export type NewRoleSearch = { new?: true; from?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateNewRoleSearch(search: Record<string, unknown>): NewRoleSearch {
  const open = search.new === true || search.new === 1 || search.new === '1'
  const from = typeof search.from === 'string' && UUID.test(search.from) ? search.from : undefined
  return open ? { new: true, from } : {}
}
