import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { type FeatureKey, isFeatureKey, type ReleaseStage } from '@vento/shared'
import { PageSkeleton } from '@/components/shell/page-skeleton'
import { isNotFound } from '@/lib/error-data'
import { formatWhen } from '../activity/activity-item'
import { ConsoleNotFoundPage } from '../shell/console-not-found'
import { useConsoleTitle } from '../shell/use-console-title'
import { BackLink } from '../ui/back-link'
import { DetailCard } from '../ui/detail-card'
import { ListError } from '../ui/list-states'
import { groupOf, moduleLabel } from '../words'
import { releaseQuery } from './queries'
import { StageBadge } from './release-cells'
import { NeedsAndPlans } from './release-plans'
import { Holders, RecentChanges, ReleaseOverrides } from './release-sections'
import { KillSwitch, StageControl } from './stage-control'
import { StageDialog } from './stage-dialog'

/** Feature detail (pattern: detail page): stage, needs, plans, holders, overrides, changes. */
export function ReleasePage() {
  const { key } = useParams({ from: '/console/releases/$key' })
  if (!isFeatureKey(key)) return <ConsoleNotFoundPage />
  return <Release featureKey={key} />
}

function Release({ featureKey }: { featureKey: FeatureKey }) {
  const search = useSearch({ from: '/console/releases/$key' })
  const navigate = useNavigate()
  const query = useQuery(releaseQuery(featureKey))
  const release = query.data
  useConsoleTitle(release?.label ?? 'Release')
  const move = (stage: ReleaseStage | undefined) =>
    void navigate({
      to: '/console/releases/$key',
      params: { key: featureKey },
      search: stage ? { move: stage } : {},
      replace: stage === undefined,
      resetScroll: false,
    })

  if (!release) {
    if (query.isError && isNotFound(query.error)) return <ConsoleNotFoundPage />
    if (query.isError) {
      return (
        <ListError
          what="This feature"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )
    }
    return <PageSkeleton />
  }

  const offLine =
    release.stage === 'off' && release.stageChange
      ? `Off for everyone since ${formatWhen(release.stageChange.at)} · ${release.stageChange.byName ?? 'Vento Real Estate (scheduled)'} · ${release.stageChange.reason}`
      : null

  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <BackLink to="/console/releases">Releases</BackLink>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1
            tabIndex={-1}
            className="font-heading font-semibold text-[22px] leading-tight tracking-[-0.02em] sm:text-2xl"
          >
            {release.label}
          </h1>
          <StageBadge stage={release.stage} />
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <span className="font-mono text-[12px]">{release.key}</span>
          {/* A module is its own group: "sales · Sales" would say the same thing twice. */}
          {moduleLabel(groupOf(release.key, release.module)) !== release.label &&
            ` · ${moduleLabel(groupOf(release.key, release.module))}`}
        </p>
      </div>
      {offLine && (
        <p
          role="status"
          className="rounded-lg border border-status-rose-border bg-status-rose-bg px-3.5 py-2.5 text-[13px] text-status-rose-fg"
        >
          {offLine}
        </p>
      )}
      <DetailCard title="Stage">
        <div className="py-1">
          <StageControl stage={release.stage} onMove={move} />
        </div>
      </DetailCard>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <NeedsAndPlans release={release} />
          <Holders release={release} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ReleaseOverrides release={release} />
          <RecentChanges release={release} />
        </div>
      </div>
      <KillSwitch
        label={release.label}
        off={release.stage === 'off'}
        onTurnOff={() => move('off')}
      />
      {search.move && search.move !== release.stage && (
        <StageDialog
          key={search.move}
          release={release}
          stage={search.move}
          onClose={() => move(undefined)}
        />
      )}
    </div>
  )
}
