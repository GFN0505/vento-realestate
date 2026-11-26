import { createFileRoute } from '@tanstack/react-router'
import { loadConsoleData } from '@/features/console/load'
import { OrganizationPage } from '@/features/console/organizations/organization-page'
import {
  featuresQuery,
  organizationActivityQuery,
  organizationQuery,
} from '@/features/console/organizations/queries'
import { plansQuery } from '@/features/console/plans/queries'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { isOrganizationId, validateOrganizationSearch } from './-search'

export const Route = createFileRoute('/console/organizations/$organizationId')({
  codeSplitGroupings: [['loader', 'component'], ['errorComponent']],
  validateSearch: validateOrganizationSearch,
  // Opening a sheet or filtering features never reloads the page's data.
  loader: ({ context: { queryClient }, params: { organizationId: id } }) =>
    isOrganizationId(id) &&
    loadConsoleData(queryClient, [
      organizationQuery(id),
      featuresQuery(id),
      organizationActivityQuery(id),
      // Change plan and Start trial open on their options, not a skeleton.
      plansQuery(),
    ]),
  component: OrganizationPage,
  errorComponent: ConsolePageError,
})
