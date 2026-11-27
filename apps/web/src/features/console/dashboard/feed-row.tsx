import { Link } from '@tanstack/react-router'
import type { FeedRow as Row } from '@vento/shared/console'
import { cn } from '@/lib/utils'
import { ago, feedWhat } from './dashboard-words'

const TONE = {
  amber: 'text-status-amber-fg',
  rose: 'text-status-rose-fg',
} as const

/**
 * "Lekki Partners Ltd · 3 people joined · today": the organization (a link), what happened and
 * when. Security events are amber or rose, with words that say so (never colour alone).
 */
export function FeedRow({
  row,
  showOrganization = true,
}: {
  row: Row
  showOrganization?: boolean
}) {
  const what = feedWhat(row)
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 border-t py-2.5 text-[13px] first:border-t-0">
      {showOrganization && (
        <>
          <Link
            to="/console/organizations/$organizationId"
            params={{ organizationId: row.organization.id }}
            className="rounded-sm font-semibold outline-hidden hover:underline hover:underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
          >
            {row.organization.name}
          </Link>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
        </>
      )}
      <span className={cn(what.tone && cn('font-medium', TONE[what.tone]))}>{what.text}</span>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <time dateTime={row.latestAt} className="text-muted-foreground tabular-nums">
        {ago(row.latestAt)}
      </time>
    </li>
  )
}
