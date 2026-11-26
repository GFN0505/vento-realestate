import { Link } from '@tanstack/react-router'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { footerNav, type NavItem, sidebarSections } from '@/features/shell/nav'
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
    <div className="flex flex-col gap-3">
      {sidebarSections(permissions).map((section, index) => (
        <fieldset
          key={section.heading}
          aria-label={section.heading}
          className="flex flex-col gap-px"
        >
          {collapsed ? (
            index > 0 && <span aria-hidden className="mx-auto mb-2 h-px w-5 bg-sidebar-border/60" />
          ) : (
            <span
              aria-hidden
              className="truncate px-2.5 pb-1 font-semibold text-[10.5px] text-sidebar-faint-foreground uppercase tracking-[0.07em]"
            >
              {section.heading}
            </span>
          )}
          {section.items.map((item) => (
            <SidebarLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

/** Settings (owners and admins) and Help, above Collapse. */
export function SidebarFooterNav({ collapsed = false, onNavigate }: Props) {
  const { permissions } = useEffectiveAccess()
  return (
    <div className="flex flex-col gap-px">
      {footerNav(permissions).map((item) => (
        <SidebarLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

export const sidebarRow =
  'group flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 font-medium text-[13.5px] outline-none transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 max-lg:h-11'

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: (() => void) | undefined
}) {
  const soon = item.status === 'soon'
  const link = (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/', includeSearch: false }}
      onClick={onNavigate}
      className={cn(
        sidebarRow,
        // Unbuilt modules read quieter; the page itself says "Coming soon".
        soon ? 'text-sidebar-faint-foreground' : 'text-sidebar-muted-foreground',
        'data-[status=active]:bg-sidebar-active data-[status=active]:text-sidebar-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <item.icon
        aria-hidden
        className="size-4 shrink-0 group-data-[status=active]:text-sidebar-active-icon"
        strokeWidth={1.75}
      />
      {collapsed ? (
        <span className="sr-only">
          {item.label}
          {soon ? ', coming soon' : ''}
        </span>
      ) : (
        <>
          <span className="truncate">{item.label}</span>
          {soon && (
            <>
              <span className="sr-only">, coming soon</span>
              {/* The word appears on hover or focus only, never as a row of pills. */}
              <span
                aria-hidden
                className="ml-auto text-[11px] text-sidebar-faint-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                Soon
              </span>
            </>
          )}
        </>
      )}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {soon ? ' · Soon' : ''}
      </TooltipContent>
    </Tooltip>
  )
}
