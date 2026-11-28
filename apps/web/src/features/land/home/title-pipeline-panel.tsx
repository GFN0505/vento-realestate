import { Link } from '@tanstack/react-router'
import type { LandHome } from '@vento/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { stageLabel } from '@/features/land/land-words'
import { HomePanel, HomePanelNote } from '@/features/shell/home-panel'
import { cn } from '@/lib/utils'
import { LAND_HOME_COPY, parcelsCount, sinceText } from './land-home-words'

type Props = Pick<LandHome, 'pipeline' | 'titledCount' | 'hasParcels'>

/**
 * Title pipeline (board HomeLand): parcels at each stage in catalog order, the one waiting
 * longest named, then the titled ones. Bars share one scale, so the counts compare at a glance.
 * Each row is one link (44 px and more): a stage opens the parcel waiting longest; Titled opens
 * the list's Titled filter.
 */
export function TitlePipelinePanel({ pipeline, titledCount, hasParcels }: Props) {
  const total = pipeline.reduce((sum, s) => sum + s.count, 0) + titledCount
  const share = (n: number) => (total > 0 ? n / total : 0)
  return (
    <HomePanel title="Title pipeline">
      {total === 0 ? (
        <HomePanelNote>
          {hasParcels ? LAND_HOME_COPY.pipelineEmpty : LAND_HOME_COPY.pipelineNoParcels}
        </HomePanelNote>
      ) : (
        <ul className="-mx-2 flex flex-col gap-1">
          {pipeline.map((stage) => {
            const longest = stage.parcels[0]
            const bar = (
              <PipelineRow
                label={stageLabel(stage.stageType)}
                count={stage.count}
                share={share(stage.count)}
                tone="blue"
                // Waiting since today says nothing worth a line.
                note={
                  longest && longest.sinceDays > 0
                    ? `Waiting longest: ${longest.name}, ${sinceText(longest.sinceDays)}`
                    : null
                }
              />
            )
            return (
              <li key={stage.stageType}>
                {longest ? (
                  <Link
                    to="/land/$parcelId"
                    params={{ parcelId: longest.id }}
                    preload="intent"
                    className={rowLink}
                  >
                    {bar}
                  </Link>
                ) : (
                  <div className={rowBox}>{bar}</div>
                )}
              </li>
            )
          })}
          {titledCount > 0 && (
            <li>
              <Link to="/land" search={{ filter: 'titled' }} preload="intent" className={rowLink}>
                <PipelineRow
                  label={LAND_HOME_COPY.titled}
                  count={titledCount}
                  share={share(titledCount)}
                  tone="emerald"
                  note={null}
                />
              </Link>
            </li>
          )}
        </ul>
      )}
    </HomePanel>
  )
}

const rowBox = 'flex min-h-11 flex-col justify-center rounded-md px-2 py-2'
const rowLink = cn(
  rowBox,
  'outline-hidden transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
)

function PipelineRow({
  label,
  count,
  share,
  tone,
  note,
}: {
  label: string
  count: number
  share: number
  tone: 'blue' | 'emerald'
  note: string | null
}) {
  return (
    <span className="flex flex-col gap-1.5 text-[13px]">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <span className="sr-only">, </span>
          {parcelsCount(count)}
        </span>
      </span>
      <span aria-hidden className="block h-[7px] overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'block h-full rounded-full',
            tone === 'blue' ? 'bg-status-blue' : 'bg-status-emerald',
          )}
          // At least a sliver, so one parcel among many still shows.
          style={{ width: `${Math.max(4, Math.round(share * 100))}%` }}
        />
      </span>
      {note && (
        <span className="truncate text-muted-foreground text-xs tabular-nums">
          <span className="sr-only">. </span>
          {note}
        </span>
      )}
    </span>
  )
}

export function TitlePipelineSkeleton() {
  return (
    <HomePanel title="Title pipeline">
      <div aria-hidden className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="flex justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-14" />
            </span>
            <Skeleton className="h-[7px] w-full rounded-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </HomePanel>
  )
}
