import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { canSeeChecklist } from '@/features/checklist/checklist-queries'
import { SetupChecklist } from '@/features/checklist/setup-checklist'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { TrialLine } from '@/features/plan/trial-line'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { greeting, longDateInLagos } from './greeting'
import { HomeHero } from './home-hero'
import { homeKpis, kpiNote } from './home-kpis'
import { navItemForModule, workspaceModules } from './nav'
import { usePageTitle } from './use-page-title'
import { WorkspaceGrid } from './workspace-grid'

/**
 * Home (boards ExecutiveHome and the role homes): a hero greeting on the brand's navy, the setup
 * checklist for owners and admins, the role's four numbers, then the modules this member can open. The same shape for every role and
 * in Preview. Honest: a number appears only when the module that owns it ships.
 */
export function HomePage() {
  const me = useMe()
  const access = useEffectiveAccess()
  const entity = useCurrentEntity()
  usePageTitle('Home')

  const kpis = homeKpis(access, access.roleKey)
  const note = kpiNote(kpis, (m) => navItemForModule(m)?.label ?? m)
  const modules = workspaceModules(access)

  const entityLabel =
    entity.status === 'pending' && !entity.locked ? (
      <Skeleton className="inline-block h-3.5 w-24 bg-auth-hairline align-middle" />
    ) : (
      (entity.entity?.name ?? 'All entities')
    )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 lg:gap-9">
      <HomeHero
        greeting={greeting(me.user.name)}
        date={longDateInLagos()}
        context={
          <>
            {me.organization?.name} · {entityLabel}
          </>
        }
      />
      <TrialLine />
      {canSeeChecklist(access) && <SetupChecklist />}
      {kpis.length > 0 && (
        <section aria-label="Your numbers" className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <StatCard key={kpi.label} label={kpi.label} icon={kpi.icon} />
            ))}
          </div>
          {note && <p className="text-muted-foreground text-xs">{note}</p>}
        </section>
      )}
      <WorkspaceGrid modules={modules} access={access} />
    </div>
  )
}
