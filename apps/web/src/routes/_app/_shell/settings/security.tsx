import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import { SecurityPage } from '@/features/security/security-page'
import { securityQuery, sessionsQuery } from '@/features/settings/security-queries'
import { validateSecuritySearch } from '@/features/settings/security-search'

export const Route = createFileRoute('/_app/_shell/settings/security')({
  // Your account is the same in every company: the company switcher hides (spec). Personal, so
  // no module and no guard: everyone can open it, whatever their role (3d).
  staticData: { orgWide: true },
  validateSearch: validateSecuritySearch,
  loader: ({ context: { queryClient } }) => {
    // In parallel, never awaited one after the other; each card fails and retries on its own.
    void queryClient.prefetchQuery(sessionsQuery())
    return queryClient.prefetchQuery(securityQuery())
  },
  component: SecurityRoute,
})

function SecurityRoute() {
  const { do: intent } = Route.useSearch()
  const navigate = Route.useNavigate()
  const clear = useCallback(() => void navigate({ search: {}, replace: true }), [navigate])
  return <SecurityPage intent={intent} onIntentHandled={clear} />
}
