import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { Me } from '@vento/shared'
import type { ReactNode } from 'react'
import { meQuery } from '@/features/account/api'

/** Renders with `me` already loaded, as the `_app` guard guarantees inside the shell. */
export function renderWithMe(ui: ReactNode, me: Me) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(meQuery().queryKey, me)
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}
