import { ChevronsUpDownIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { Avatar } from '@/components/avatar'
import { LazyMenu, type LazyMenuProps } from '@/components/ui/lazy-menu'
import { useMe } from '@/features/preview/use-effective-permissions'
import { cn } from '@/lib/utils'

/** "Olumide Bankole" → "Olumide B." (board ExecutiveHome account button). */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.at(-1)
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? name)
}

export type UserMenuVariant = {
  /** `topbar`: the avatar on tablets; `sidebar`: the card at the bottom-left on desktop. */
  variant: 'topbar' | 'sidebar'
  collapsed?: boolean
}

export function userTriggerClass({ variant, collapsed }: UserMenuVariant) {
  return variant === 'topbar'
    ? 'flex size-10 items-center justify-center rounded-full outline-hidden transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring'
    : cn(
        'flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left outline-hidden transition-colors hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 data-[state=open]:bg-sidebar-hover',
        collapsed && 'justify-center px-0',
      )
}

/** What the trigger shows; shared by the plain button and the loaded menu's trigger. */
export function UserTriggerContent({ variant, collapsed }: UserMenuVariant) {
  const me = useMe()
  if (variant === 'topbar' || collapsed) {
    return (
      <>
        <Avatar name={me.user.name} />
        <span className="sr-only">Account: {shortName(me.user.name)}</span>
      </>
    )
  }
  return (
    <>
      <Avatar name={me.user.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-[13px] text-sidebar-foreground">
          <span className="sr-only">Account: </span>
          {me.user.name}
        </span>
        <span className="truncate text-[11.5px] text-sidebar-muted-foreground">
          {me.member?.role.name}
        </span>
      </span>
      <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-sidebar-faint-foreground" />
    </>
  )
}

const load = (props: UserMenuVariant) => () =>
  import('./user-menu-panel').then(
    (m): ComponentType<LazyMenuProps> =>
      (lazyProps) => <m.UserMenuPanel {...props} {...lazyProps} />,
  )
const loaders = {
  topbar: load({ variant: 'topbar' }),
  sidebar: load({ variant: 'sidebar' }),
  collapsed: load({ variant: 'sidebar', collapsed: true }),
}

/**
 * Board ExecutiveHome user menu, with the spec's Theme choice and Preview as role. On desktop it
 * lives at the bottom of the sidebar (like Linear and Mercury), so the top bar holds only the
 * entity and search. The menu loads on first approach.
 */
export function UserMenu({ variant, collapsed = false }: UserMenuVariant) {
  const key = variant === 'topbar' ? 'topbar' : collapsed ? 'collapsed' : 'sidebar'
  return (
    <LazyMenu key={key} load={loaders[key]} className={userTriggerClass({ variant, collapsed })}>
      <UserTriggerContent variant={variant} collapsed={collapsed} />
    </LazyMenu>
  )
}
