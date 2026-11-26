import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { type NavItem, sidebarSections } from '@/features/shell/nav'
import { cn } from '@/lib/utils'

type Props = {
  /** Icons only, with tooltips (desktop collapsed). */
  collapsed?: boolean
  /** Close the sheet after picking an entry (tablet). */
  onNavigate?: () => void
}

/** The role's modules, grouped above six entries (spec "Navigation rules"). */
export function SidebarNav({ collapsed = false, onNavigate }: Props) {
  const { permissions } = useEffectiveAccess()
  return (
    <div className="flex flex-col gap-0.5">
      {sidebarSections(permissions).map((section) => (
        <fieldset
          key={section.heading}
          aria-label={section.heading}
          className="flex flex-col gap-0.5"
        >
          <span
            aria-hidden
            className={cn(
              'truncate px-3 pt-3 pb-1 font-bold text-[10px] text-sidebar-faint-foreground uppercase tracking-[0.06em]',
              // Collapsed: keep a little air between groups, no text.
              collapsed && 'h-2 p-0 text-transparent',
            )}
          >
            {!collapsed && section.heading}
          </span>
          {section.items.map((item) => (
            <SidebarLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: (() => void) | undefined
}) {
  const link = (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/', includeSearch: false }}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'group flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-[13px] text-sidebar-muted-foreground outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 active:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-active-foreground max-lg:min-h-11',
        collapsed && 'justify-center px-0',
      )}
    >
      <item.icon aria-hidden className="size-[17px] shrink-0" strokeWidth={1.7} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.status === 'soon' && (
        // On the active row the tag lightens to keep 5.8:1 on the violet tint.
        <Badge
          variant="sidebar"
          className="ml-auto group-data-[status=active]:text-sidebar-muted-foreground"
        >
          Soon
        </Badge>
      )}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.status === 'soon' ? ' · Soon' : ''}
      </TooltipContent>
    </Tooltip>
  )
}
