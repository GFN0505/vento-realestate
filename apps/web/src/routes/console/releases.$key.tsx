import { createFileRoute } from '@tanstack/react-router'
import { isFeatureKey } from '@vento/shared'
import { loadConsoleData } from '@/features/console/load'
import { plansQuery } from '@/features/console/plans/queries'
import { releaseQuery } from '@/features/console/releases/queries'
import { ReleasePage } from '@/features/console/releases/release-page'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { validateReleaseSearch } from './-search'

export const Route = createFileRoute('/console/releases/$key')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  validateSearch: validateReleaseSearch,
  // A key the code doesn't know is the page's 404; nothing is requested for it.
  loader: ({ context: { queryClient }, params: { key } }) =>
    isFeatureKey(key) ? loadConsoleData(queryClient, [releaseQuery(key), plansQuery()]) : undefined,
  component: ReleasePage,
  errorComponent: ConsolePageError,
})
