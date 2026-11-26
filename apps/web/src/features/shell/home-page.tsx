import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { canPreview, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { modKeyLabel } from '@/lib/platform'
import { greeting, longDateInLagos } from './greeting'
import { homeKpis } from './home-kpis'
import { navItemForModule, workspaceModules } from './nav'
import { SetupCard } from './setup-card'
import { usePageTitle } from './use-page-title'
import { WorkspaceGrid } from './workspace-grid'

/**
 * Home (boards ExecutiveHome and the role homes): greeting, the role's four numbers, set-up for
 * owners and admins, and the modules this member can open. Honest: no number is shown until
 * the module that owns it ships.
 */
export function HomePage() {
  const me = useMe()
  const access = useEffectiveAccess()
  const entity = useCurrentEntity()
  usePageTitle('Home')

  const kpis = homeKpis(access.permissions, access.roleKey)
  const modules = workspaceModules(access.permissions)
  // Setting up is the real owner's job, not the previewed role's.
  const showSetup = canPreview(me) && !access.previewing

  const entityLabel =
    entity.status === 'pending' && !entity.locked ? (
      <Skeleton className="inline-block h-3.5 w-24 align-middle" />
    ) : (
      (entity.entity?.name ?? 'All entities')
    )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-7">
      <PageHeader
        title={greeting(me.user.name)}
        description={
          <>
            {me.organization?.name} · {entityLabel} · {longDateInLagos()}
          </>
        }
      />
      {kpis.length > 0 && (
        <section
          aria-label="Your numbers"
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          {kpis.map((kpi) => (
            <StatCard
              key={kpi.label}
              label={kpi.label}
              value="—"
              pending
              caption={`Arrives with ${navItemForModule(kpi.module)?.label ?? 'its module'}`}
            />
          ))}
        </section>
      )}
      {showSetup && <SetupCard />}
      <WorkspaceGrid modules={modules} />
      <p className="text-muted-foreground text-xs pointer-coarse:hidden">
        Tip: press <Kbd className="h-[18px] min-w-[18px] text-[10px]">{modKeyLabel('K')}</Kbd>{' '}
        anywhere to jump to a page or run an action.
      </p>
    </div>
  )
}
