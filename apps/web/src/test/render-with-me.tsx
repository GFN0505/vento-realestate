import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { Me, Role } from '@vento/shared'
import type { ReactNode } from 'react'
import { meQuery } from '@/features/account/api'
import { rolesQuery } from '@/features/preview/use-effective-permissions'

/**
 * Renders with `me` already loaded, as the `_app` guard guarantees inside the shell. Pass the
 * roles too when a test previews one (the guard loads them first).
 */
export function renderWithMe(
  ui: ReactNode,
  me: Me,
  roles?: Role[],
  /** Other cached queries the component reads (e.g. the setup checklist). */
  seed?: (queryClient: QueryClient) => void,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(meQuery().queryKey, me)
  if (roles) {
    queryClient.setQueryData(rolesQuery().queryKey, {
      items: roles,
      page: 1,
      pageSize: roles.length,
      total: roles.length,
      requiredForEveryone: false,
    })
  }
  seed?.(queryClient)
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}
