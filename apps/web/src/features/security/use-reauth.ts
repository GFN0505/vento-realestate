import { useQueryClient } from '@tanstack/react-query'
import type { SecurityOverview } from '@vento/shared'
import { securityUi } from './security-dialogs'
import { securityQuery } from './security-queries'

// A window that closes in the next few seconds would expire mid-action; ask now instead.
const MARGIN_MS = 10_000

/** Whether "Confirm it's you" was answered recently enough to skip it. */
export function confirmedRecently(data: SecurityOverview | undefined, now = Date.now()): boolean {
  const until = data?.reauthenticatedUntil
  return !!until && Date.parse(until) - now > MARGIN_MS
}

/**
 * `ensureConfirmed()` resolves true at once inside the 5-minute window, else opens "Confirm it's
 * you" and resolves when it's answered (false when cancelled). One question for several
 * actions in a row (spec).
 */
export function useReauth() {
  const queryClient = useQueryClient()
  return {
    ensureConfirmed(): Promise<boolean> {
      const data = queryClient.getQueryData<SecurityOverview>(securityQuery().queryKey)
      return confirmedRecently(data) ? Promise.resolve(true) : securityUi.confirm()
    },
    /** The server said the window closed (another tab, a clock skew): forget it and ask. */
    expire() {
      queryClient.setQueryData<SecurityOverview>(securityQuery().queryKey, (data) =>
        data ? { ...data, reauthenticatedUntil: null } : data,
      )
    },
  }
}
