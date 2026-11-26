import { Link } from '@tanstack/react-router'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { footerNav, type NavItem, sidebarSections } from '@/features/shell/nav'
import { cn } from '@/lib/utils'

type Props = {
  /** Icons only, with tooltips (desktop collapsed). */
  collapsed?: boolean
  /** Close the sheet after picking an entry (tablet). */
  onNavigate?: () => void
}

/** Home, then the role's modules (decision 12: only those it can view). */
export function SidebarNav({ collapsed = false, onNavigate }: Props) {
  const { permissions } = useEffectiveAccess()
  return (
    <div className="flex flex-col gap-4">
      {sidebarSections(permissions).map((section, index) => (
        <fieldset
          key={section.heading}
          aria-label={section.heading}
          className="flex flex-col gap-px"
        >
          {/* No visible headings: one quiet gap (a hairline when collapsed) after Home. */}
          {collapsed && index > 0 && (
            <span aria-hidden className="mx-auto mb-2 h-px w-5 bg-sidebar-border/60" />
          )}
          {section.items.map((item) => (
            <SidebarLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

/** Settings and Help, above Collapse, once they have somewhere to go (nav.ts). */
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
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/', includeSearch: false }}
      onClick={onNavigate}
      // Collapsed: the label shows on hover (no tooltip library in the first load).
      title={collapsed ? `${item.label}${soon ? ' · Soon' : ''}` : undefined}
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
}
