import { VentoMark } from '@/components/vento-mark'
import { STAFF_LABEL } from './console-nav'
import { ConsoleUserMenu } from './console-user-menu'

/**
 * Below lg there's no sidebar, so the top bar carries the mark and the amber staff label (spec:
 * visible on every page at every width) and the account.
 */
export function ConsoleTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-2 sm:px-6 lg:hidden">
      <VentoMark size={26} wordmark={false} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-heading font-semibold text-[15px] leading-tight">Vento console</span>
        <span className="truncate font-semibold text-[11px] text-status-amber-fg uppercase tracking-[0.05em]">
          {STAFF_LABEL}
        </span>
      </div>
      <ConsoleUserMenu variant="topbar" />
    </header>
  )
}
