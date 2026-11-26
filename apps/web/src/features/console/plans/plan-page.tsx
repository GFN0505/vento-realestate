import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { PageSkeleton } from '@/components/shell/page-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isNotFound } from '@/lib/error-data'
import { isPlanKey } from '@/routes/console/-search'
import { ConsoleNotFoundPage } from '../shell/console-not-found'
import { useConsoleTitle } from '../shell/use-console-title'
import { BackLink } from '../ui/back-link'
import { ListError } from '../ui/list-states'
import { PlanVersionCard } from './plan-version-card'
import { PublishSheet } from './publish/publish-sheet'
import { planQuery } from './queries'

/** Plan detail: versions side by side, latest first (spec). Publishing never moves anyone. */
export function PlanPage() {
  const { planKey } = useParams({ from: '/console/plans/$planKey' })
  if (!isPlanKey(planKey)) return <ConsoleNotFoundPage />
  return <Plan planKey={planKey} />
}

function Plan({ planKey }: { planKey: string }) {
  const search = useSearch({ from: '/console/plans/$planKey' })
  const navigate = useNavigate()
  const query = useQuery(planQuery(planKey))
  const plan = query.data
  useConsoleTitle(plan?.name ?? 'Plan')
  const setPublish = (open: boolean) =>
    void navigate({
      to: '/console/plans/$planKey',
      params: { planKey },
      search: open ? { publish: 'version' } : {},
      replace: !open,
      resetScroll: false,
    })

  if (!plan) {
    if (query.isError && isNotFound(query.error)) return <ConsoleNotFoundPage />
    if (query.isError) {
      return (
        <ListError
          what="This plan"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )
    }
    return <PageSkeleton />
  }

  const versions = [...plan.versions].sort((a, b) => b.version - a.version)
  const latest = versions[0]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <BackLink to="/console/plans">Plans</BackLink>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1
              tabIndex={-1}
              className="font-heading font-semibold text-[22px] leading-tight tracking-[-0.02em] sm:text-2xl"
            >
              {plan.name}
            </h1>
            {plan.defaultForNew && <Badge variant="brand">Default for new organizations</Badge>}
          </div>
          <p className="mt-1 font-mono text-[12px] text-muted-foreground">{plan.key}</p>
        </div>
        <Button onClick={() => setPublish(true)} className="max-md:h-11">
          Publish v{(latest?.version ?? 0) + 1}
        </Button>
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {versions.map((version, i) => (
          <PlanVersionCard
            key={version.id}
            version={version}
            latest={i === 0}
            planName={plan.name}
            className="w-[min(85vw,360px)] shrink-0 snap-start"
          />
        ))}
      </div>
      {search.publish === 'version' && (
        <PublishSheet plan={plan} onClose={() => setPublish(false)} />
      )}
    </div>
  )
}
