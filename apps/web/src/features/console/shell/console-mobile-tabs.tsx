import { Link, useLocation } from '@tanstack/react-router'
import { EllipsisIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ConsoleMoreSheet } from './console-more-sheet'
import { CONSOLE_MORE, CONSOLE_TABS, isCurrent } from './console-nav'

const tab =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-[3px] rounded-lg font-semibold text-[11px] text-muted-foreground outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring active:bg-muted aria-[current=page]:text-nav-active data-[current]:text-nav-active'

/** Phones and tablets: Organizations, Releases, Plans and More (spec "Its own shell"). */
export function ConsoleMobileTabs() {
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useLocation({ select: (l) => l.pathname })
  const inMore = CONSOLE_MORE.some((item) => isCurrent(item, pathname))
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {CONSOLE_TABS.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          aria-current={isCurrent(item, pathname) ? 'page' : undefined}
          className={tab}
        >
          <item.icon aria-hidden className="size-[22px]" strokeWidth={1.8} />
          <span className="max-w-full truncate px-0.5">{item.label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        data-current={inMore ? '' : undefined}
        className={cn(tab, 'cursor-default')}
      >
        <EllipsisIcon aria-hidden className="size-[22px]" strokeWidth={1.8} />
        More
      </button>
      <ConsoleMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </nav>
  )
}
