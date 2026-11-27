import { createFileRoute } from '@tanstack/react-router'
import { RulesPage } from '@/features/approval-rules/rules-page'
import { approvalRulesQuery } from '@/features/approval-rules/rules-queries'
import { validateRulesSearch } from '@/features/approval-rules/rules-search'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/settings/approval-rules')({
  // Organization-wide: the company switcher hides here (decision 0014).
  staticData: { module: 'settings', orgWide: true },
  // Before any loader: a role without settings view gets the 403 and requests nothing.
  beforeLoad: moduleGuard('settings'),
  validateSearch: validateRulesSearch,
  loader: ({ context: { queryClient } }) => {
    // The rule sheet's roles; not awaited, the table never waits for them.
    void queryClient.prefetchQuery(rolesQuery())
    // prefetchQuery never throws: a failure shows "couldn't load" with Try again.
    return queryClient.prefetchQuery(approvalRulesQuery())
  },
  component: RulesPage,
})
