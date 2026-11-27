import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { lastActiveLabel } from '@/features/team/last-active'
import { FeedRow } from '../dashboard/feed-row'
import { accountActivityQuery } from '../dashboard/queries'
import { CardNote, DetailCard } from '../ui/detail-card'
import { count } from '../words'

/**
 * Account activity (spec 1b §2): "9 of 11 people active in the last 7 days · last active today",
 * then this organization's notable account events for 30 days. Counts and times only.
 */
export function AccountActivityCard({ organizationId }: { organizationId: string }) {
  const query = useQuery(accountActivityQuery(organizationId))
  const data = query.data
  return (
    <DetailCard title="Account activity">
      {!data ? (
        query.isError ? (
          <CardNote>
            Account activity couldn't load. Check your connection and reload the page.
          </CardNote>
        ) : (
          <div aria-hidden className="flex flex-col gap-3 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        )
      ) : (
        <>
          <p className="pb-2 text-[13px] tabular-nums">
            {count(data.activeLast7Days)} of {count(data.people)}{' '}
            {data.people === 1 ? 'person' : 'people'} active in the last 7 days · last active{' '}
            {lastActiveLabel(data.lastActiveAt).toLowerCase()}
          </p>
          {data.feed.length === 0 ? (
            <CardNote>No account activity in the last 30 days.</CardNote>
          ) : (
            <ul aria-label="Account activity" className="border-t">
              {data.feed.map((row) => (
                <FeedRow key={`${row.kind}:${row.day}`} row={row} showOrganization={false} />
              ))}
            </ul>
          )}
        </>
      )}
    </DetailCard>
  )
}
