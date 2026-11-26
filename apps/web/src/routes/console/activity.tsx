import { createFileRoute } from '@tanstack/react-router'
import { ActivityPage } from '@/features/console/activity/activity-page'
import { activityPeopleQuery, activityQuery } from '@/features/console/activity/queries'
import { loadConsoleData } from '@/features/console/load'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { validateActivitySearch } from './-search'

export const Route = createFileRoute('/console/activity')({
  codeSplitGroupings: [['loader', 'component'], ['errorComponent']],
  validateSearch: validateActivitySearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) =>
    loadConsoleData(queryClient, [activityQuery(deps), activityPeopleQuery()]),
  component: ActivityPage,
  errorComponent: ConsolePageError,
})
