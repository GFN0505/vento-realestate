import { Link } from '@tanstack/react-router'
import { ChevronsUpDownIcon, LogOutIcon, UserRoundIcon } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { THEME_OPTIONS } from '@/components/shell/theme-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe } from '@/features/preview/use-effective-permissions'
import { setTheme, type Theme, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useLeaveConsole } from './use-leave-console'

type Props = { variant: 'sidebar' | 'topbar' }

/** Name and email, My account, theme, Sign out (plan §1b.13). */
export function ConsoleUserMenu({ variant }: Props) {
  const me = useMe()
  const theme = useTheme()
  const leave = useLeaveConsole()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring',
          variant === 'topbar'
            ? 'flex size-11 items-center justify-center rounded-full hover:bg-muted'
            : 'flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover',
        )}
      >
        <Avatar name={me.user.name} />
        {variant === 'topbar' ? (
          <span className="sr-only">Account: {me.user.name}</span>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-[13px] text-sidebar-foreground">
                <span className="sr-only">Account: </span>
                {me.user.name}
              </span>
              <span className="truncate text-[11.5px] text-sidebar-muted-foreground">
                Super-admin
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden className="size-4 text-sidebar-faint-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'topbar' ? 'end' : 'start'}
        side={variant === 'topbar' ? 'bottom' : 'top'}
        className="w-[272px]"
      >
        <div className="px-2.5 pt-2 pb-2.5">
          <p className="truncate font-semibold text-sm">{me.user.name}</p>
          <p className="truncate text-muted-foreground text-xs" title={me.user.email}>
            {me.user.email}
          </p>
        </div>
        <DropdownMenuItem asChild>
          <Link to="/console/account" preload="intent">
            <UserRoundIcon aria-hidden />
            My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon aria-hidden />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void leave.signOut()}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
