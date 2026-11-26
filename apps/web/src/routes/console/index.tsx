import { createFileRoute } from '@tanstack/react-router'
import { loadConsoleData } from '@/features/console/load'
import { OrganizationsPage } from '@/features/console/organizations/organizations-page'
import { organizationsQuery, summaryQuery } from '@/features/console/organizations/queries'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { validateOrganizationsSearch } from './-search'

export const Route = createFileRoute('/console/')({
  // The loader imports console code, so it's split off with the page (never in the main chunk).
  codeSplitGroupings: [['loader', 'component'], ['errorComponent']],
  validateSearch: validateOrganizationsSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) =>
    loadConsoleData(queryClient, [organizationsQuery(deps), summaryQuery()]),
  component: OrganizationsPage,
  errorComponent: ConsolePageError,
})
