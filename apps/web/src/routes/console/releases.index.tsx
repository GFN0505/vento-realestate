import { createFileRoute } from '@tanstack/react-router'
import { loadConsoleData } from '@/features/console/load'
import { releasesQuery } from '@/features/console/releases/queries'
import { ReleasesPage } from '@/features/console/releases/releases-page'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { validateReleasesSearch } from './-search'

export const Route = createFileRoute('/console/releases/')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  validateSearch: validateReleasesSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) =>
    loadConsoleData(queryClient, [releasesQuery(deps.filter)]),
  component: ReleasesPage,
  errorComponent: ConsolePageError,
})
