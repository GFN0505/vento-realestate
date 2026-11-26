import { Link, useLocation } from '@tanstack/react-router'
import { sidebarRow } from '@/components/shell/sidebar-nav'
import { VentoMark } from '@/components/vento-mark'
import { cn } from '@/lib/utils'
import { CONSOLE_NAV, isCurrent, STAFF_LABEL } from './console-nav'
import { ConsoleUserMenu } from './console-user-menu'

/**
 * The console's navy sidebar (board AdminOrgs): the Vento mark, the fixed amber label, the five
 * built sections and the account at the bottom-left. No organization or company switcher, no
 * customer modules (spec "Its own shell").
 */
export function ConsoleSidebar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  return (
    <nav
      aria-label="Console"
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-sidebar-edge border-r bg-sidebar px-3 py-3 text-sidebar-foreground max-lg:hidden"
    >
      <div className="flex flex-col gap-1.5 px-2 pt-1 pb-4">
        <VentoMark size={22} tone="navy" descriptor={false} className="text-sidebar-foreground" />
        <span className="font-bold text-[10.5px] text-sidebar-staff uppercase tracking-[0.06em]">
          {STAFF_LABEL}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
        {CONSOLE_NAV.map((item) => {
          const current = isCurrent(item, pathname)
          return (
            <Link
              key={item.key}
              to={item.to}
              preload="intent"
              aria-current={current ? 'page' : undefined}
              className={cn(
                sidebarRow,
                current
                  ? 'bg-sidebar-active text-sidebar-foreground'
                  : 'text-sidebar-muted-foreground',
              )}
            >
              <item.icon
                aria-hidden
                strokeWidth={1.75}
                className={cn('size-4 shrink-0', current && 'text-sidebar-active-icon')}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
      <div className="border-sidebar-border/50 border-t pt-2">
        <ConsoleUserMenu variant="sidebar" />
      </div>
    </nav>
  )
}
