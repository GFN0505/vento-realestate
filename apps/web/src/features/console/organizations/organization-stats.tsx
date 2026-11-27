import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import type { OrganizationsSearch } from '@/routes/console/-search'
import { StatButton } from '../ui/stat-button'
import { count } from '../words'
import { summaryQuery } from './queries'

type Filter = OrganizationsSearch['filter']

/** Organizations · On trial · Pilot · Over a limit; each one filters the list (spec). */
export function OrganizationStats({
  filter,
  onFilter,
}: {
  filter: Filter
  onFilter: (filter: Filter) => void
}) {
  const summary = useQuery(summaryQuery()).data
  const toggle = (next: Filter) => () => onFilter(filter === next ? undefined : next)
  if (!summary) {
    return (
      <div aria-hidden className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[84px] rounded-[10px]" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <StatButton
        label="Organizations"
        value={count(summary.organizations)}
        note={`+${count(summary.newThisMonth)} this month`}
        pressed={filter === undefined}
        onClick={() => onFilter(undefined)}
      />
      <StatButton
        label="On trial"
        value={count(summary.onTrial)}
        note={`${count(summary.trialsEndingThisWeek)} end this week`}
        pressed={filter === 'trial'}
        onClick={toggle('trial')}
      />
      <StatButton
        label="Pilot"
        value={count(summary.pilot)}
        pressed={filter === 'pilot'}
        onClick={toggle('pilot')}
      />
      <StatButton
        label="Over a limit"
        value={count(summary.overLimit)}
        tone={summary.overLimit > 0 ? 'rose' : 'default'}
        pressed={filter === 'over_limit'}
        onClick={toggle('over_limit')}
      />
    </div>
  )
}
