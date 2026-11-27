import { VentoMark } from '@/components/vento-mark'
import { STAFF_LABEL_SHORT } from './console-nav'
import { ConsoleUserMenu } from './console-user-menu'

/**
 * Below lg there's no sidebar, so the top bar carries the lockup (it counts as the full name,
 * short form a) and the amber staff label (visible on every page at every width; short form b
 * because the full label doesn't fit at 375 px), and the account.
 */
export function ConsoleTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-2 sm:px-6 lg:hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <VentoMark size={22} />
        <span className="truncate font-semibold text-[11px] text-status-amber-fg uppercase tracking-[0.05em]">
          {STAFF_LABEL_SHORT}
        </span>
      </div>
      <ConsoleUserMenu variant="topbar" />
    </header>
  )
}
