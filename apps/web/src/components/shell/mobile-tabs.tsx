import { Link, useLocation } from '@tanstack/react-router'
import { EllipsisIcon } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { mobileTabs, moreItems } from '@/features/shell/nav'
import { cn } from '@/lib/utils'

// The sheet (and Radix Dialog) load on first tap, keeping them out of the first load.
const MoreSheet = lazy(() => import('./more-sheet').then((m) => ({ default: m.MoreSheet })))

const tab =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-[3px] rounded-lg font-semibold text-[11px] text-muted-foreground outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-ring active:bg-muted data-[status=active]:text-nav-active'

/** Phones: Home, up to three of the modules the member can open, and More (boards *Mobile). */
export function MobileTabs() {
  const access = useEffectiveAccess()
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreUsed, setMoreUsed] = useState(false)
  const pathname = useLocation({ select: (l) => l.pathname })
  const tabs = mobileTabs(access, access.roleKey)
  const inMore = moreItems(access, access.roleKey).some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )

  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {tabs.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          activeOptions={{ exact: item.to === '/', includeSearch: false }}
          className={tab}
        >
          <item.icon aria-hidden className="size-[22px]" strokeWidth={1.8} />
          <span className="max-w-full truncate px-0.5">{item.label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={() => {
          setMoreUsed(true)
          setMoreOpen(true)
        }}
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        data-status={inMore ? 'active' : undefined}
        className={cn(tab, 'cursor-default')}
      >
        <EllipsisIcon aria-hidden className="size-[22px]" strokeWidth={1.8} />
        More
      </button>
      {moreUsed && (
        <Suspense fallback={null}>
          <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
        </Suspense>
      )}
    </nav>
  )
}
