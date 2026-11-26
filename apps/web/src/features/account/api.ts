import { ORPCError } from '@orpc/client'
import type { QueryClient } from '@tanstack/react-query'
import type { NextStep } from '@vento/shared'
import { orpc } from '@/lib/orpc'

/**
 * Who is signed in and where they go next. Guards and pages share this one query. Coming back
 * to the tab always rechecks it, so a changed role, a removal or an organization switched in
 * another tab shows up without waiting for a request.
 */
export function meQuery() {
  return orpc.account.me.queryOptions({
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
    retry: false,
  })
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'UNAUTHORIZED'
}

/** The page each `nextStep` lives on. `ready` people can go anywhere in the app. */
export const NEXT_STEP_PATH: Record<Exclude<NextStep, 'ready'>, string> = {
  onboarding_organization: '/onboarding',
  onboarding_entity: '/onboarding',
  two_step_setup: '/two-step/setup',
}

/** After a sign-in or sign-out, drop everything cached for the previous person. */
export function resetForNewSession(queryClient: QueryClient) {
  queryClient.removeQueries()
}
