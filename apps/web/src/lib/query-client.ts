import { ORPCError } from '@orpc/client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { connection } from '@/lib/connection'
import { errorReason } from '@/lib/error-data'
import { orpc } from '@/lib/orpc'
import { sessionExpired } from '@/lib/session-expired'
import { twoStepSetupUi } from '@/lib/two-step-setup-ui'

function isUnauthorized(error: unknown) {
  return error instanceof ORPCError && error.code === 'UNAUTHORIZED'
}

export function createQueryClient() {
  // Someone who was signed in on this page gets the "Session expired" dialog over it, so what
  // they typed stays. Someone who never was (first load) is sent to sign-in by the guard.
  function onError(error: unknown) {
    // The organization's 7 days ran out mid-work: set up over the page, nothing typed is lost.
    if (
      error instanceof ORPCError &&
      error.code === 'FORBIDDEN' &&
      errorReason(error) === 'two_step_setup_required'
    ) {
      twoStepSetupUi.open('required')
      return
    }
    if (!isUnauthorized(error)) return
    const wasSignedIn = client
      .getQueryCache()
      .findAll({ queryKey: orpc.account.me.key() })
      .some((query) => query.state.data !== undefined)
    if (wasSignedIn) sessionExpired.open()
  }

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Data stays fresh for 30s, so moving between screens doesn't refetch everything.
        staleTime: 30_000,
        // Offline requests fail fast into the designed offline states instead of pausing.
        networkMode: 'always',
        // Weak networks: retry reads with backoff, but never a refused sign-in or permission,
        // and never while offline (the offline page retries when the connection returns).
        retry: (count, error) =>
          connection.isOnline() &&
          count < 2 &&
          !(error instanceof ORPCError && error.status >= 400 && error.status < 500),
      },
      mutations: { networkMode: 'always' },
    },
  })

  // Back online: reload whatever failed while we were away.
  connection.onReconnect(() => {
    void client.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' })
  })
  return client
}
