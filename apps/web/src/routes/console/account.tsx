import { createFileRoute } from '@tanstack/react-router'
import { MyAccountPage } from '@/features/console/account/my-account-page'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { securityQuery, sessionsQuery } from '@/features/settings/security-queries'

export const Route = createFileRoute('/console/account')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  // Personal procedures (`account.*`), not the console's: they need no console window.
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(sessionsQuery())
    return queryClient.prefetchQuery(securityQuery())
  },
  component: MyAccountPage,
  errorComponent: ConsolePageError,
})
