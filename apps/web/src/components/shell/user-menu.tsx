import { EyeIcon, KeyboardIcon, LogOutIcon } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { canPreview, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { shellUi } from '@/features/shell/shell-ui'
import { useShellActions } from '@/features/shell/use-shell-actions'
import { setTheme, type Theme, useTheme } from '@/lib/theme'
import { PreviewRoles } from './preview-roles'
import { THEME_OPTIONS } from './theme-icons'

/** "Olumide Bankole" → "Olumide B." (board ExecutiveHome account button). */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.at(-1)
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? name)
}

/** Board ExecutiveHome user menu, with the spec's Theme choice and Preview as role. */
export function UserMenu() {
  const me = useMe()
  const access = useEffectiveAccess()
  const theme = useTheme()
  const actions = useShellActions()
  const role = me.member?.role.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 items-center gap-2 rounded-full border bg-background py-0.5 pr-3 pl-0.5 outline-none transition-colors hover:border-input-hover focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-input-hover">
        <Avatar name={me.user.name} />
        <span className="sr-only">Account: </span>
        <span className="max-w-[140px] truncate font-semibold text-xs max-xl:sr-only">
          {shortName(me.user.name)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <div className="px-2.5 pt-2 pb-2.5">
          <p className="truncate font-semibold text-sm">{me.user.name}</p>
          <p className="truncate text-muted-foreground text-xs" title={me.user.email}>
            {role ? `${role} · ` : ''}
            {me.user.email}
          </p>
        </div>
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
        {canPreview(me) && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <EyeIcon aria-hidden />
              Preview as role
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[240px]">
              <DropdownMenuRadioGroup
                value={access.previewing?.id ?? ''}
                onValueChange={actions.preview}
              >
                <PreviewRoles
                  row={(r) => (
                    <DropdownMenuRadioItem key={r.id} value={r.id}>
                      {r.name}
                    </DropdownMenuRadioItem>
                  )}
                  status={(message, retry) => (
                    <DropdownMenuItem
                      disabled={!retry}
                      onSelect={(e) => {
                        e.preventDefault()
                        retry?.()
                      }}
                    >
                      {message}
                    </DropdownMenuItem>
                  )}
                />
              </DropdownMenuRadioGroup>
              {access.previewing && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={actions.stopPreview}>Stop preview</DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={() => shellUi.open('shortcuts')}>
          <KeyboardIcon aria-hidden />
          Keyboard shortcuts
          <Kbd className="ml-auto">?</Kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void actions.signOut()}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
