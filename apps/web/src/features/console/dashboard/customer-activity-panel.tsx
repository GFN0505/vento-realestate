import type { Dashboard } from '@vento/shared/console'
import { CardNote, DetailCard } from '../ui/detail-card'
import { summaryLine } from './dashboard-words'
import { FeedRow } from './feed-row'

/** Panel 1 (spec §2): how customers' accounts moved this week, never who did what. */
export function CustomerActivityPanel({ activity }: { activity: Dashboard['activity'] }) {
  return (
    <DetailCard title="Customer activity · last 7 days">
      <p className="pb-2 text-[13px] text-muted-foreground tabular-nums leading-relaxed">
        {summaryLine(activity.summary)}
      </p>
      {activity.feed.length === 0 ? (
        <CardNote>No customer activity in the last 7 days.</CardNote>
      ) : (
        <>
          <ul aria-label="Customer activity" className="border-t">
            {activity.feed.map((row) => (
              <FeedRow key={`${row.organization.id}:${row.kind}:${row.day}`} row={row} />
            ))}
          </ul>
          <p className="border-t pt-2.5 pb-1 text-muted-foreground text-xs">
            Older activity is on each organization's page.
          </p>
        </>
      )}
    </DetailCard>
  )
}
