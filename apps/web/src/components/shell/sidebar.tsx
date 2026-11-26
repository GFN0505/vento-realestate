import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VentoMark } from '@/components/vento-mark'
import { toggleSidebar, useSidebarCollapsed } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { OrganizationSwitcher } from './organization-switcher'
import { SidebarFooterNav, SidebarNav, sidebarRow } from './sidebar-nav'
import { UserMenu } from './user-menu'

/**
 * The fixed navy sidebar on lg and wider (board ExecutiveHome), refined: lockup, organization
 * card, the role's modules, then Settings, Help, Collapse and the account at the bottom-left.
 * Its width comes from --sidebar-width, set before first paint (248px open, 64px collapsed).
 */
export function Sidebar() {
  const collapsed = useSidebarCollapsed()
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-(--sidebar-width) flex-col overflow-x-hidden border-sidebar-edge border-r bg-sidebar py-3 text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none max-lg:hidden',
        collapsed ? 'px-2.5' : 'px-3',
      )}
    >
      <SidebarHeader collapsed={collapsed} />
      <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-3">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="flex flex-col gap-px border-sidebar-border/50 border-t pt-2">
        <SidebarFooterNav collapsed={collapsed} />
        <CollapseButton collapsed={collapsed} />
        <div className="mt-1.5">
          <UserMenu variant="sidebar" collapsed={collapsed} />
        </div>
      </div>
    </nav>
  )
}

function CollapseButton({ collapsed }: { collapsed: boolean }) {
  const Icon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon
  const button = (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-expanded={!collapsed}
      aria-keyshortcuts="["
      className={cn(
        sidebarRow,
        'text-sidebar-faint-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
      {collapsed ? <span className="sr-only">Expand sidebar</span> : <span>Collapse</span>}
      {!collapsed && <span className="sr-only"> sidebar</span>}
    </button>
  )
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">Expand sidebar · [</TooltipContent>
    </Tooltip>
  )
}

/** Lockup and organization card. Shared with the tablet sheet. */
export function SidebarHeader({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className={cn('flex h-9 items-center px-2', collapsed && 'justify-center px-0')}>
        <VentoMark
          size={22}
          tone="navy"
          wordmark={!collapsed}
          className="text-sidebar-foreground"
        />
      </div>
      <OrganizationSwitcher collapsed={collapsed} />
    </div>
  )
}
