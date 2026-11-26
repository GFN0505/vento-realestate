import { ChevronLeftIcon } from 'lucide-react'
import { VentoMark } from '@/components/vento-mark'
import { toggleSidebar, useSidebarCollapsed } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { OrganizationSwitcher } from './organization-switcher'
import { SidebarNav } from './sidebar-nav'

/**
 * The fixed navy sidebar on lg and wider (board ExecutiveHome): lockup, organization, the
 * role's modules and Collapse. Its width comes from --sidebar-width, set before first paint.
 */
export function Sidebar() {
  const collapsed = useSidebarCollapsed()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-40 flex w-(--sidebar-width) flex-col gap-0.5 overflow-x-hidden border-sidebar-edge border-r bg-sidebar px-3 py-4 text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none max-lg:hidden"
    >
      <SidebarHeader collapsed={collapsed} />
      <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <SidebarNav collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        className={cn(
          'flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-[13px] text-sidebar-faint-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0',
          collapsed && 'justify-center px-0',
        )}
      >
        <ChevronLeftIcon
          aria-hidden
          className={cn(
            'size-[17px] shrink-0 transition-transform duration-200 motion-reduce:transition-none',
            collapsed && 'rotate-180',
          )}
          strokeWidth={1.8}
        />
        {!collapsed && <span>Collapse</span>}
      </button>
    </nav>
  )
}

/** Lockup and organization. Shared with the tablet sheet. */
export function SidebarHeader({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 pb-2">
      <div className={cn('flex h-10 items-center px-2.5', collapsed && 'justify-center px-0')}>
        <VentoMark
          size={24}
          tone="navy"
          wordmark={!collapsed}
          className="text-sidebar-foreground"
        />
      </div>
      {!collapsed && <OrganizationSwitcher />}
    </div>
  )
}
