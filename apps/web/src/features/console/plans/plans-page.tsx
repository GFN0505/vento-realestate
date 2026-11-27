import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { PlanRow } from '@vento/shared/console'
import { ChevronRightIcon, LayersIcon, PlusIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { useConsoleTitle } from '../shell/use-console-title'
import { ListEmpty, ListError, ListSkeleton } from '../ui/list-states'
import { count, plural } from '../words'
import { PublishSheet } from './publish/publish-sheet'
import { plansQuery } from './queries'

/** "Latest v2 · 47 on v2, 3 on v1": the latest version and who is on which, newest first. */
export function versionsLine(plan: PlanRow): string {
  const versions = [...plan.versions].sort((a, b) => b.version - a.version)
  const total = versions.reduce((sum, v) => sum + v.organizations, 0)
  if (versions.length <= 1)
    return `Latest v${plan.latestVersion} · ${plural(total, 'organization')}`
  const who = versions.map((v) => `${count(v.organizations)} on v${v.version}`).join(', ')
  return `Latest v${plan.latestVersion} · ${who}`
}

/** Plans (pattern: list page): each plan, its latest version and who is on each version. */
export function PlansPage() {
  useConsoleTitle('Plans')
  const phone = useMediaQuery(PHONE_QUERY)
  const search = useSearch({ from: '/console/plans/' })
  const navigate = useNavigate()
  const list = useQuery(plansQuery())
  const plans = [...(list.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const setPublish = (open: boolean) =>
    void navigate({ to: '/console/plans', search: open ? { publish: 'new' } : {}, replace: !open })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Plans"
        description={list.data ? plural(list.data.length, 'plan') : ' '}
        actions={
          <Button onClick={() => setPublish(true)} className="max-md:h-11">
            <PlusIcon aria-hidden />
            New plan
          </Button>
        }
      />
      {list.isError && !list.data ? (
        <ListError what="Plans" onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : !list.data ? (
        <ListSkeleton phone={phone} rows={3} />
      ) : plans.length === 0 ? (
        <ListEmpty icon={LayersIcon}>
          No plans yet. Publish the first one to put organizations on it.
        </ListEmpty>
      ) : (
        <ul aria-label="Plans" className="flex flex-col gap-2">
          {plans.map((plan) => (
            <li key={plan.key}>
              <Link
                to="/console/plans/$planKey"
                params={{ planKey: plan.key }}
                data-testid="plan-row"
                className="flex min-h-[68px] items-center gap-4 rounded-[10px] border bg-card px-4 py-3 outline-hidden transition-colors hover:bg-muted/50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring sm:px-5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[14px]">{plan.name}</span>
                    {plan.defaultForNew && (
                      <Badge variant="brand">Default for new organizations</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {versionsLine(plan)}
                  </span>
                </span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {search.publish === 'new' && <PublishSheet plan={null} onClose={() => setPublish(false)} />}
    </div>
  )
}
