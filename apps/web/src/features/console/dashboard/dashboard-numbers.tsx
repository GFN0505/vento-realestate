import { Link, type LinkProps } from '@tanstack/react-router'
import type { Dashboard } from '@vento/shared/console'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { count, plural } from '../words'

function NumberTile({
  label,
  value,
  note,
  tone,
  ...link
}: {
  label: string
  value: ReactNode
  note: ReactNode
  tone?: 'rose'
} & Pick<LinkProps, 'to' | 'search'>) {
  return (
    <Link
      {...link}
      className="flex min-h-[92px] flex-col gap-1 rounded-[10px] border bg-card px-4 py-3.5 outline-hidden transition-colors hover:bg-muted/50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-sm:rounded-[14px] max-sm:px-3.5 max-sm:py-3"
    >
      <span className="font-semibold text-muted-foreground text-xs max-sm:text-[11px]">
        {label}
      </span>
      <span
        className={cn(
          'font-heading font-semibold text-[22px] tabular-nums leading-tight max-sm:text-lg',
          tone === 'rose' && 'text-status-rose-fg',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums max-sm:text-[11px]">{note}</span>
    </Link>
  )
}

/** The four numbers (spec §2), each opening the list it counts. 2 × 2 on phones. */
export function DashboardNumbers({ numbers }: { numbers: Dashboard['numbers'] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <NumberTile
        to="/console/organizations"
        label="Organizations"
        value={count(numbers.organizations)}
        note={`+${count(numbers.newLast7Days)} in the last 7 days`}
      />
      <NumberTile
        to="/console/organizations"
        label="Active this week"
        value={plural(numbers.activePeople, 'person', 'people')}
        note={`in ${plural(numbers.activeOrganizations, 'organization')}`}
      />
      <NumberTile
        to="/console/organizations"
        search={{ filter: 'trial' }}
        label="Trials ending soon"
        value={count(numbers.trialsEndingSoon)}
        note="in the next 7 days"
      />
      <NumberTile
        to="/console/organizations"
        search={{ filter: 'over_limit' }}
        label="Over a limit"
        value={count(numbers.overLimit)}
        note={`${count(numbers.atLimit)} more at a limit`}
        tone={numbers.overLimit > 0 ? 'rose' : undefined}
      />
    </div>
  )
}
