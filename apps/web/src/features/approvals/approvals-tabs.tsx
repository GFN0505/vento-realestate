import { Link } from '@tanstack/react-router'
import type { ApprovalsTab } from '@vento/shared'
import { cn } from '@/lib/utils'

const TABS: readonly { tab: ApprovalsTab; label: string }[] = [
  { tab: 'waiting', label: 'Waiting for me' },
  { tab: 'mine', label: 'My requests' },
  { tab: 'decided', label: 'Decided' },
]

/** "Waiting for me · 4" for screen readers too; nothing after the words at zero. */
export function tabLabel(tab: ApprovalsTab, waiting: number | null): string {
  const label = TABS.find((t) => t.tab === tab)?.label ?? ''
  return tab === 'waiting' && waiting ? `${label} · ${waiting}` : label
}

/**
 * Waiting for me · My requests · Decided (board Approvals). Links, not buttons: each tab is an
 * address, so Back works and a tab can be shared. The company (`?entity`) rides along.
 */
export function ApprovalsTabs({
  current,
  waiting,
}: {
  current: ApprovalsTab
  /** null until the first list answers. */
  waiting: number | null
}) {
  return (
    <nav aria-label="Approvals">
      <ul className="flex gap-1 border-b">
        {TABS.map(({ tab }) => {
          const on = tab === current
          return (
            <li key={tab}>
              <Link
                to="/approvals"
                search={{ tab: tab === 'waiting' ? undefined : tab }}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-11 items-center border-b-2 px-2.5 font-semibold text-[13px] tabular-nums outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  on
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tabLabel(tab, waiting)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
