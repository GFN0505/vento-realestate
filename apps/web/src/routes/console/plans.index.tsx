import { createFileRoute } from '@tanstack/react-router'
import { loadConsoleData } from '@/features/console/load'
import { PlansPage } from '@/features/console/plans/plans-page'
import { plansQuery } from '@/features/console/plans/queries'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { validatePlansSearch } from './-search'

export const Route = createFileRoute('/console/plans/')({
  codeSplitGroupings: [['loader', 'component'], ['errorComponent']],
  validateSearch: validatePlansSearch,
  loader: ({ context: { queryClient } }) => loadConsoleData(queryClient, [plansQuery()]),
  component: PlansPage,
  errorComponent: ConsolePageError,
})
