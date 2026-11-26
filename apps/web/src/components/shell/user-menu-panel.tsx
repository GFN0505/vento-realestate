import { EyeIcon, KeyboardIcon, LogOutIcon } from 'lucide-react'
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
import { type LazyMenuProps, useAutoFocus } from '@/components/ui/lazy-menu'
import { canPreview, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { shellUi } from '@/features/shell/shell-ui'
import { useShellActions } from '@/features/shell/use-shell-actions'
import { setTheme, type Theme, useTheme } from '@/lib/theme'
import { PreviewRoles } from './preview-roles'
import { THEME_OPTIONS } from './theme-icons'
import { type UserMenuVariant, UserTriggerContent, userTriggerClass } from './user-menu'

/** The user menu itself, loaded when its trigger is first approached (see UserMenu). */
export function UserMenuPanel({
  variant,
  collapsed,
  defaultOpen,
  autoFocus,
}: UserMenuVariant & LazyMenuProps) {
  const trigger = useAutoFocus<HTMLButtonElement>(autoFocus)
  const me = useMe()
  const access = useEffectiveAccess()
  const theme = useTheme()
  const actions = useShellActions()
  const role = me.member?.role.name

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger ref={trigger} className={userTriggerClass({ variant, collapsed })}>
        <UserTriggerContent variant={variant} collapsed={collapsed} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'topbar' ? 'end' : 'start'}
        side={variant === 'topbar' ? 'bottom' : 'top'}
        className="w-[272px]"
      >
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
