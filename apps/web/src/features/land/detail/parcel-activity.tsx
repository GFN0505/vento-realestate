import { useQuery } from '@tanstack/react-query'
import type { TimelineEvent } from '@vento/shared'
import { TimelineItem, type TimelineMark } from '@/components/timeline-item'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { changeText, whenText } from '@/features/audit-log/audit-words'
import { TeamPagination } from '@/features/team/team-pagination'
import { cn } from '@/lib/utils'
import { ACTIVITY_PAGE_SIZE, parcelActivityQuery } from '../parcels-queries'
import { DETAIL_COPY } from './detail-words'

type Props = { parcelId: string; page: number; onPage: (page: number) => void }

/** Granted stages and new files read as progress; a removal or an archive as an ending. */
function markOf(event: TimelineEvent): TimelineMark {
  if (event.action === 'land.document.removed' || event.action === 'land.parcel.archived') {
    return 'rejected'
  }
  if (/ granted$/.test(event.what) || event.action === 'land.parcel.created') return 'done'
  return 'event'
}

/**
 * The parcel's activity (spec: the first record timeline, read from the audit trail): what
 * happened, who did it, when, and field by field what changed. Newest first, 25 a page.
 */
export function ParcelActivity({ parcelId, page, onPage }: Props) {
  const activity = useQuery(parcelActivityQuery(parcelId, page))
  const data = activity.data

  if (activity.isError && !data) {
    return (
      <div className="flex flex-col items-start gap-2 py-2">
        <p role="alert" className="text-[13px] text-muted-foreground">
          {DETAIL_COPY.activityError}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void activity.refetch()}
          disabled={activity.isFetching}
          className="max-md:h-11"
        >
          Try again
        </Button>
      </div>
    )
  }
  if (!data) return <ActivitySkeleton />
  if (data.items.length === 0) {
    return <p className="py-2 text-[13px] text-muted-foreground">{DETAIL_COPY.activityEmpty}</p>
  }

  return (
    <div
      aria-busy={activity.isFetching || undefined}
      className={cn(
        'flex flex-col gap-4 transition-opacity duration-150',
        activity.isPlaceholderData && 'opacity-60',
      )}
    >
      <ol aria-label={DETAIL_COPY.activity} className="flex flex-col">
        {data.items.map((event, i) => (
          <ActivityItem key={event.id} event={event} last={i === data.items.length - 1} />
        ))}
      </ol>
      <TeamPagination
        page={page}
        pageSize={ACTIVITY_PAGE_SIZE}
        total={data.total}
        onPage={onPage}
      />
    </div>
  )
}

function ActivityItem({ event, last }: { event: TimelineEvent; last: boolean }) {
  const when = whenText(event.at)
  const changes = event.changes.map(changeText)
  return (
    <TimelineItem
      mark={markOf(event)}
      title={event.what}
      meta={when}
      last={last}
      spoken={[`${event.what}, by ${event.actor.name}, ${when}`, ...changes].join('. ')}
      detail={
        <span className="flex flex-col gap-1">
          {event.changes.length > 0 && (
            <span className="flex flex-col gap-0.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs tabular-nums">
              {event.changes.map((change) => (
                <span key={change.label} className="wrap-anywhere">
                  <span className="text-muted-foreground">{change.label}: </span>
                  {change.before !== null && (
                    <>
                      <span className="text-muted-foreground">{change.before}</span> →{' '}
                    </>
                  )}
                  <b className="font-semibold text-foreground">{change.after ?? '—'}</b>
                </span>
              ))}
            </span>
          )}
          <span className="text-xs">{event.actor.name}</span>
        </span>
      }
    />
  )
}

function ActivitySkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
