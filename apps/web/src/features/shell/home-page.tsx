import { LayoutDashboardIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { modKeyLabel } from '@/lib/platform'
import { greeting, longDateInLagos } from './greeting'
import { usePageTitle } from './use-page-title'

/** Board ExecutiveHome header (greeting and date line); the numbers arrive with their modules. */
export function HomePage() {
  const me = useMe()
  const access = useEffectiveAccess()
  const entity = useCurrentEntity()
  usePageTitle('Home')

  const entityLabel =
    entity.status === 'pending' && !entity.locked ? (
      <Skeleton className="inline-block h-3.5 w-24 align-middle" />
    ) : (
      (entity.entity?.name ?? 'All entities')
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={greeting(me.user.name)}
        description={
          <>
            {me.organization?.name} · {entityLabel} · {longDateInLagos()}
          </>
        }
      />
      <EmptyState icon={LayoutDashboardIcon}>
        <p>
          Your home fills in as modules arrive: the numbers that matter to you
          {access.roleName ? ` as ${access.roleName}` : ''}, and the work waiting for you.
        </p>
        <p className="mt-3 text-[13px] pointer-coarse:hidden">
          Press <Kbd>{modKeyLabel('K')}</Kbd> anywhere to jump to a page or run an action.
        </p>
      </EmptyState>
    </div>
  )
}
