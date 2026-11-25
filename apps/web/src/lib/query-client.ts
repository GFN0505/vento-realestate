import { ORPCError } from '@orpc/client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import { sessionExpired } from '@/lib/session-expired'

function isUnauthorized(error: unknown) {
  return error instanceof ORPCError && error.code === 'UNAUTHORIZED'
}

export function createQueryClient() {
  // Someone who was signed in on this page gets the "Session expired" dialog over it, so what
  // they typed stays. Someone who never was (first load) is sent to sign-in by the guard.
  function onError(error: unknown) {
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
        // Weak networks: retry reads with backoff, but never a refused sign-in or permission.
        retry: (count, error) =>
          count < 2 && !(error instanceof ORPCError && error.status >= 400 && error.status < 500),
      },
    },
  })
  return client
}
