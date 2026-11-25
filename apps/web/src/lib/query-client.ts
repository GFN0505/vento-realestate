import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 30s, so moving between screens doesn't refetch everything.
        staleTime: 30_000,
        retry: 1,
      },
    },
  })
}
