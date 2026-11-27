import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { ActivityItem } from '../activity/activity-item'
import { CardNote, DetailCard } from '../ui/detail-card'
import { organizationActivityQuery } from './queries'

/** This organization's platform events, newest first, with **See all** on Activity (spec). */
export function ActivityCard({ organizationId }: { organizationId: string }) {
  const activity = useQuery(organizationActivityQuery(organizationId))
  const data = activity.data
  return (
    <DetailCard
      title="Activity"
      actions={
        data && data.total > data.items.length ? (
          <Link
            to="/console/activity"
            search={{ organization: organizationId }}
            className="rounded-sm font-semibold text-link text-xs outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            See all
          </Link>
        ) : null
      }
    >
      {!data ? (
        activity.isError ? (
          <CardNote>Activity couldn't load. Check your connection and reload the page.</CardNote>
        ) : (
          <div aria-hidden className="flex flex-col gap-3 py-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )
      ) : data.items.length === 0 ? (
        <CardNote>
          No changes yet. Changes Vento Real Estate makes here appear with who, why and when.
        </CardNote>
      ) : (
        <ul>
          {data.items.map((row) => (
            <ActivityItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </DetailCard>
  )
}
