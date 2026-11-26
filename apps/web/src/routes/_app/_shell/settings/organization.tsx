import { createFileRoute } from '@tanstack/react-router'
import { OrganizationPage } from '@/features/organization/profile/organization-page'
import {
  organizationQuery,
  organizationSecurityQuery,
} from '@/features/organization/profile/organization-queries'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/settings/organization')({
  // Organization-wide: the company switcher hides here (decision 0014).
  staticData: { module: 'settings', orgWide: true },
  // Before any loader: a role without settings view gets the 403 and requests nothing.
  beforeLoad: moduleGuard('settings'),
  // prefetchQuery never throws: a failure shows "couldn't load" with Try again.
  loader: ({ context: { queryClient } }) => {
    // Side by side: the Security card's data never waits for the profile.
    void queryClient.prefetchQuery(organizationSecurityQuery())
    return queryClient.prefetchQuery(organizationQuery())
  },
  component: OrganizationPage,
})
