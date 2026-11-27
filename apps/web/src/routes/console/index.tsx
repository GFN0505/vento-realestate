import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/console/dashboard/dashboard-page'
import { dashboardQuery } from '@/features/console/dashboard/queries'
import { loadConsoleData } from '@/features/console/load'
import { ConsolePageError } from '@/features/console/shell/console-route-error'

/** The console's home (1b): the Dashboard. Organizations moved to /console/organizations. */
export const Route = createFileRoute('/console/')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  loader: ({ context: { queryClient } }) => loadConsoleData(queryClient, [dashboardQuery()]),
  component: DashboardPage,
  errorComponent: ConsolePageError,
})
