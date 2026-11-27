import { createFileRoute } from '@tanstack/react-router'
import { loadConsoleData } from '@/features/console/load'
import { PlanPage } from '@/features/console/plans/plan-page'
import { planQuery } from '@/features/console/plans/queries'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { isPlanKey, validatePlanSearch } from './-search'

export const Route = createFileRoute('/console/plans/$planKey')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  validateSearch: validatePlanSearch,
  loader: ({ context: { queryClient }, params }) =>
    isPlanKey(params.planKey) && loadConsoleData(queryClient, [planQuery(params.planKey)]),
  component: PlanPage,
  errorComponent: ConsolePageError,
})
