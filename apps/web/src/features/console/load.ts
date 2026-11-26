import type { QueryClient } from '@tanstack/react-query'
import { consoleGate } from './gate/console-gate'

/** Any query's options; only the key is read here, the rest goes to TanStack Query as is. */
type Options = { queryKey: readonly unknown[] }

/**
 * A console route's loader: start every read at once (no waterfall). A first visit waits for
 * its data so the page arrives whole; after that the page shows what's cached while it refreshes.
 * With the window closed nothing waits: requests park until "Confirm it's you" (plan §9.3), and
 * prefetching never throws, so a failure shows the page's own error state.
 */
export async function loadConsoleData(
  queryClient: QueryClient,
  queries: readonly Options[],
): Promise<void> {
  const missing = queries.some((q) => queryClient.getQueryData(q.queryKey) === undefined)
  const loads = queries.map((q) => queryClient.prefetchQuery(q))
  if (missing && consoleGate.isOpen()) await Promise.all(loads)
}
