import { useQuery } from '@tanstack/react-query'
import { PageSkeleton } from '@/components/shell/page-skeleton'
import { isNotFound } from '@/lib/error-data'
import { isOrganizationId } from '@/routes/console/-search'
import { ConsoleNotFoundPage } from '../shell/console-not-found'
import { useConsoleTitle } from '../shell/use-console-title'
import { ListError } from '../ui/list-states'
import { ActivityCard } from './activity-card'
import { FeaturesCard } from './features-card'
import { OrganizationHeader } from './organization-header'
import { OverridesCard } from './overrides-card'
import { PlanCard } from './plan-card'
import { organizationQuery } from './queries'
import { OrganizationChanges } from './sheets/organization-changes'
import { AddOnsCard, TrialCard } from './trial-and-add-ons'
import { useOrganizationSearch } from './use-organization-search'

/**
 * Organization detail (board AdminOrgDetail's header and card layout, with the spec's cards).
 * Facts only: the owner, counts, dates and Vento's own settings, never members, buyers or money.
 */
export function OrganizationPage() {
  const { organizationId } = useOrganizationSearch()
  if (!isOrganizationId(organizationId)) return <ConsoleNotFoundPage />
  return <Organization organizationId={organizationId} />
}

function Organization({ organizationId }: { organizationId: string }) {
  const query = useQuery(organizationQuery(organizationId))
  const org = query.data
  useConsoleTitle(org?.name ?? 'Organization')

  if (!org) {
    if (query.isError && isNotFound(query.error)) return <ConsoleNotFoundPage />
    if (query.isError) {
      return (
        <ListError
          what="This organization"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )
    }
    return <PageSkeleton />
  }

  return (
    <div className="flex flex-col gap-5">
      <OrganizationHeader org={org} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <PlanCard org={org} />
        <div className="flex min-w-0 flex-col gap-4">
          {org.trial && <TrialCard trial={org.trial} />}
          <AddOnsCard addOns={org.addOns} />
        </div>
        <OverridesCard org={org} />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FeaturesCard organizationId={org.id} />
        <ActivityCard organizationId={org.id} />
      </div>
      <OrganizationChanges org={org} />
    </div>
  )
}
