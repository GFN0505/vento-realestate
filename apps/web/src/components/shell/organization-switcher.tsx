import { ChevronsUpDownIcon } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { LazyMenu, type LazyMenuProps } from '@/components/ui/lazy-menu'
import { useMe } from '@/features/preview/use-effective-permissions'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The organization's square: initials on a brand tint (no logos until branding ships). */
function OrgAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent font-bold text-[11px] text-sidebar-accent-foreground tracking-wide"
    >
      {initials(name) || 'V'}
    </span>
  )
}

export function orgCardClass(collapsed: boolean, interactive: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-lg border border-sidebar-border/50 bg-sidebar-hover p-2 text-left text-sidebar-foreground',
    collapsed && 'justify-center border-transparent bg-transparent p-1',
    interactive &&
      'outline-hidden transition-colors hover:bg-sidebar-active focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 data-[state=open]:bg-sidebar-active',
  )
}

/** The card's contents; shared by the plain button and the loaded menu's trigger. */
export function OrgCardContent({
  collapsed,
  switchable,
  trailing,
}: {
  collapsed: boolean
  switchable: boolean
  trailing?: ReactNode
}) {
  const me = useMe()
  const current = me.organization
  if (!current) return null
  const role = me.organizations.find((o) => o.id === current.id)?.roleName ?? me.member?.role.name
  return (
    <>
      <OrgAvatar name={current.name} />
      {collapsed ? (
        <span className="sr-only">{current.name}</span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-[13px]" title={current.name}>
            {current.name}
          </span>
          {role && (
            <span className="truncate text-[11.5px] text-sidebar-muted-foreground">{role}</span>
          )}
        </span>
      )}
      {switchable && <span className="sr-only">, switch organization</span>}
      {switchable &&
        !collapsed &&
        (trailing ?? (
          <ChevronsUpDownIcon
            aria-hidden
            className="size-3.5 shrink-0 text-sidebar-faint-foreground"
          />
        ))}
    </>
  )
}

const load = (collapsed: boolean) => () =>
  import('./organization-menu').then(
    (m): ComponentType<LazyMenuProps> =>
      (props) => <m.OrganizationMenu {...props} collapsed={collapsed} />,
  )
const loaders = { open: load(false), collapsed: load(true) }

/**
 * The organization card under the lockup: avatar, name and your role there. People in two or
 * more organizations get a menu (switch in 2 clicks), which loads on first approach; for
 * everyone else it's a plain card. Collapsed, it's the square alone, named by its title.
 */
export function OrganizationSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const me = useMe()
  const current = me.organization
  if (!current) return null

  if (me.organizations.length < 2) {
    return (
      <div className={orgCardClass(collapsed, false)} title={collapsed ? current.name : undefined}>
        <OrgCardContent collapsed={collapsed} switchable={false} />
      </div>
    )
  }

  return (
    <div title={collapsed ? current.name : undefined}>
      <LazyMenu
        key={collapsed ? 'collapsed' : 'open'}
        load={collapsed ? loaders.collapsed : loaders.open}
        className={orgCardClass(collapsed, true)}
      >
        <OrgCardContent collapsed={collapsed} switchable />
      </LazyMenu>
    </div>
  )
}
