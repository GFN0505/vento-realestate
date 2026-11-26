import { Link } from '@tanstack/react-router'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { footerNav, type NavItem, type NavTag, navTag, sidebarSections } from '@/features/shell/nav'
import { cn } from '@/lib/utils'

type Props = {
  /** Icons only, with tooltips (desktop collapsed). */
  collapsed?: boolean
  /** Close the sheet after picking an entry (tablet). */
  onNavigate?: () => void
}

/** Home, then the modules the organization has and the role can view (decision 12). */
export function SidebarNav({ collapsed = false, onNavigate }: Props) {
  const access = useEffectiveAccess()
  return (
    <div className="flex flex-col gap-4">
      {sidebarSections(access).map((section, index) => (
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
            <SidebarLink
              key={item.key}
              item={item}
              tag={navTag(access, item)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

/** Settings and Help, above Collapse, once they have somewhere to go (nav.ts). */
export function SidebarFooterNav({ collapsed = false, onNavigate }: Props) {
  const access = useEffectiveAccess()
  return (
    <div className="flex flex-col gap-px">
      {footerNav(access).map((item) => (
        <SidebarLink
          key={item.key}
          item={item}
          tag={navTag(access, item)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

export const sidebarRow =
  'group flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 font-medium text-[13.5px] outline-hidden transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 max-lg:h-11'

const TAG_COPY: Record<NavTag, { word: string; spoken: string; hint?: string }> = {
  soon: { word: 'Soon', spoken: ', coming soon' },
  early_access: {
    word: 'Early access',
    spoken: ', early access',
    hint: 'You have early access to this. Tell us what you think.',
  },
}

function SidebarLink({
  item,
  tag,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  tag: NavTag | null
  collapsed: boolean
  onNavigate: (() => void) | undefined
}) {
  const soon = tag === 'soon'
  const copy = tag ? TAG_COPY[tag] : null
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/', includeSearch: false }}
      onClick={onNavigate}
      // Collapsed: the label shows on hover (no tooltip library in the first load).
      title={collapsed ? `${item.label}${copy ? ` · ${copy.word}` : ''}` : undefined}
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
          {copy?.spoken}
        </span>
      ) : (
        <>
          <span className="truncate">{item.label}</span>
          {copy && <span className="sr-only">{copy.spoken}</span>}
          {soon && (
            // The word appears on hover or focus only, never as a row of pills.
            <span
              aria-hidden
              className="ml-auto text-[11px] text-sidebar-faint-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              Soon
            </span>
          )}
          {tag === 'early_access' && (
            // Always on: pilots should see what's new. The violet tint is the sidebar's accent.
            <span
              aria-hidden
              title={copy?.hint}
              className="ml-auto shrink-0 rounded-full bg-sidebar-accent px-1.5 py-px font-semibold text-[10.5px] text-sidebar-accent-foreground leading-4 tracking-[0.01em]"
            >
              Early access
            </span>
          )}
        </>
      )}
    </Link>
  )
}
