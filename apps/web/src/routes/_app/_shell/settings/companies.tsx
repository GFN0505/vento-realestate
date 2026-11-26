import { createFileRoute } from '@tanstack/react-router'
import { CompaniesPage } from '@/features/companies/companies-page'
import { companiesListQuery, firstCompaniesVisit } from '@/features/companies/companies-queries'
import { validateCompaniesSearch } from '@/features/companies/companies-search'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/settings/companies')({
  // Organization-wide: the company switcher hides here (decision 0014).
  staticData: { module: 'settings', orgWide: true },
  // Before any loader: a role without settings view gets the 403 and requests nothing.
  beforeLoad: moduleGuard('settings'),
  validateSearch: validateCompaniesSearch,
  loaderDeps: ({ search: { show, q, page } }) => ({ show, q, page }),
  loader: async ({ context: { queryClient }, deps }) => {
    // prefetchQuery never throws: a failure shows "Companies couldn't load" with Try again.
    const load = queryClient.prefetchQuery(companiesListQuery(deps))
    // The first visit arrives with its rows; after that, chips and search don't wait.
    if (firstCompaniesVisit()) await load
  },
  component: CompaniesPage,
})
