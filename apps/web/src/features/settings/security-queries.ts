import { orpc } from '@/lib/orpc'

/*
 * My security reads two things, fetched in parallel by the route's loader and failing on their
 * own: the Sign-in and Passkeys cards from `account.security`, and the devices from
 * `account.sessions.list`. Both recheck when the tab comes back into focus, so a change made in
 * another tab or on another device shows before the next action (spec "two tabs").
 */

export function securityQuery() {
  return orpc.account.security.queryOptions({ staleTime: 15_000, refetchOnWindowFocus: 'always' })
}

/** Everyone's devices fit on one page; nobody has 50 sessions. */
export function sessionsQuery() {
  return orpc.account.sessions.list.queryOptions({
    input: { page: 1, pageSize: 50 },
    staleTime: 15_000,
    refetchOnWindowFocus: 'always',
  })
}
