import { ChevronsUpDownIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Avatar } from '@/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe } from '@/features/preview/use-effective-permissions'
import { cn } from '@/lib/utils'

const loadItems = () => import('./user-menu-items')
const UserMenuItems = lazy(() => loadItems().then((m) => ({ default: m.UserMenuItems })))

/** "Olumide Bankole" → "Olumide B." (board ExecutiveHome account button). */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.at(-1)
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? name)
}

type Props = {
  /** `topbar`: the pill on tablets; `sidebar`: the card at the bottom-left on desktop. */
  variant: 'topbar' | 'sidebar'
  collapsed?: boolean
}

/**
 * Board ExecutiveHome user menu, with the spec's Theme choice and Preview as role. On desktop it
 * lives at the bottom of the sidebar (like Linear and Mercury), so the top bar holds only the
 * entity and search.
 */
export function UserMenu({ variant, collapsed = false }: Props) {
  const me = useMe()
  const role = me.member?.role.name
  // Fetch the menu's rows as soon as someone heads for it.
  const preload = { onPointerEnter: () => void loadItems(), onFocus: () => void loadItems() }

  return (
    <DropdownMenu>
      {variant === 'topbar' ? (
        <DropdownMenuTrigger
          {...preload}
          className="flex size-10 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Avatar name={me.user.name} />
          <span className="sr-only">Account: {shortName(me.user.name)}</span>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          {...preload}
          className={cn(
            'flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left outline-none transition-colors hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 data-[state=open]:bg-sidebar-hover',
            collapsed && 'justify-center px-0',
          )}
        >
          <Avatar name={me.user.name} />
          {collapsed ? (
            <span className="sr-only">Account: {shortName(me.user.name)}</span>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold text-[13px] text-sidebar-foreground">
                  <span className="sr-only">Account: </span>
                  {me.user.name}
                </span>
                <span className="truncate text-[11.5px] text-sidebar-muted-foreground">{role}</span>
              </span>
              <ChevronsUpDownIcon
                aria-hidden
                className="size-4 shrink-0 text-sidebar-faint-foreground"
              />
            </>
          )}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align={variant === 'topbar' ? 'end' : 'start'}
        side={variant === 'topbar' ? 'bottom' : 'top'}
        className="w-[272px]"
      >
        <Suspense fallback={<div className="h-[318px]" aria-busy="true" />}>
          <UserMenuItems />
        </Suspense>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
