import { useLocation, useRouter } from '@tanstack/react-router'
import {
  Building2Icon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  KeyboardIcon,
  LaptopMinimalIcon,
  LayersIcon,
  LogOutIcon,
} from 'lucide-react'
import { PreviewRoles } from '@/components/shell/preview-roles'
import { THEME_OPTIONS } from '@/components/shell/theme-icons'
import { CommandGroup, CommandHint, CommandItem } from '@/components/ui/command'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useSwitchOrganization } from '@/features/organization/switch-organization'
import { canPreview, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { setTheme, useTheme } from '@/lib/theme'
import { canView, type NavPath, navItemForModule, visibleNav } from './nav'
import { readRecentPages } from './recent-pages'
import { shellUi } from './shell-ui'
import { useShellActions } from './use-shell-actions'

type Props = {
  page: 'root' | 'preview'
  onPreviewPage: () => void
  close: () => void
  navigate: (to: NavPath) => void
}

/**
 * What ⌘K offers (spec): pages the member can open and the shell's actions. Decision 12: built
 * from the same registry and effective permissions as the sidebar, so nothing hidden there
 * appears here. `keywords[0]` is the label the filter ranks on.
 */
export function CommandResults({ page, onPreviewPage, close, navigate }: Props) {
  const me = useMe()
  const access = useEffectiveAccess()
  const entity = useCurrentEntity()
  const theme = useTheme()
  const router = useRouter()
  const pathname = useLocation({ select: (l) => l.pathname })
  const actions = useShellActions()
  const switchOrganization = useSwitchOrganization()
  const run = (fn: () => void) => () => {
    close()
    fn()
  }

  if (page === 'preview') {
    return (
      <CommandGroup heading="Preview as role">
        <PreviewRoles
          row={(role) => (
            <CommandItem
              key={role.id}
              value={`preview:${role.id}`}
              keywords={[role.name, 'role']}
              onSelect={run(() => actions.preview(role.id))}
            >
              <EyeIcon aria-hidden />
              {role.name}
              {access.previewing?.id === role.id && <CommandHint>Current</CommandHint>}
            </CommandItem>
          )}
          status={(message, retry) => (
            <CommandItem
              value="preview:status"
              keywords={[message]}
              disabled={!retry}
              onSelect={() => retry?.()}
            >
              {message}
            </CommandItem>
          )}
        />
      </CommandGroup>
    )
  }

  const recent = me.organization
    ? readRecentPages(me.user.id, me.organization.id).filter((p) => {
        // The page you're on isn't "recent".
        if (p.href.split('?')[0] === pathname) return false
        const item = p.module ? navItemForModule(p.module) : undefined
        return !item || canView(access.permissions, item)
      })
    : []
  const otherOrganizations = me.organizations.filter((o) => o.id !== me.organization?.id)

  return (
    <>
      {recent.length > 0 && (
        <CommandGroup heading="Recently opened">
          {recent.map((p) => (
            <CommandItem
              key={p.href}
              value={`recent:${p.href}`}
              keywords={[p.title, 'recent']}
              onSelect={run(() => void router.navigate({ href: p.href }))}
            >
              <ClockIcon aria-hidden />
              {p.title}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      <CommandGroup heading="Go to">
        {visibleNav(access.permissions).map((item) => (
          <CommandItem
            key={item.key}
            value={`go:${item.key}`}
            keywords={[`Go to ${item.label}`, ...item.keywords]}
            onSelect={() => navigate(item.to)}
          >
            <item.icon aria-hidden />
            Go to {item.label}
            {item.key === 'home' && <CommandHint>G then H</CommandHint>}
            {item.status === 'soon' && <CommandHint>Soon</CommandHint>}
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandGroup heading="Actions">
        {!entity.locked && entity.status === 'success' && (
          <>
            {entity.entity && (
              <CommandItem
                value="entity:all"
                keywords={['Show all entities', 'switch entity']}
                onSelect={run(() => entity.select(null))}
              >
                <LayersIcon aria-hidden />
                Show all entities
                <CommandHint>Entity</CommandHint>
              </CommandItem>
            )}
            {entity.options
              .filter((e) => e.id !== entity.entity?.id)
              .map((e) => (
                <CommandItem
                  key={e.id}
                  value={`entity:${e.id}`}
                  keywords={[`Switch to ${e.name}`, 'switch entity spv']}
                  onSelect={run(() => entity.select(e.id))}
                >
                  <LayersIcon aria-hidden />
                  <span className="truncate">Switch to {e.name}</span>
                  <CommandHint>Entity</CommandHint>
                </CommandItem>
              ))}
          </>
        )}
        {otherOrganizations.map((o) => (
          <CommandItem
            key={o.id}
            value={`org:${o.id}`}
            keywords={[`Switch to ${o.name}`, 'switch organization']}
            onSelect={run(() => switchOrganization.mutate({ organizationId: o.id }))}
          >
            <Building2Icon aria-hidden />
            <span className="truncate">Switch to {o.name}</span>
            <CommandHint>Organization</CommandHint>
          </CommandItem>
        ))}
        {THEME_OPTIONS.map((option) => (
          <CommandItem
            key={option.value}
            value={`theme:${option.value}`}
            keywords={[`Theme: ${option.label}`, 'appearance mode']}
            onSelect={run(() => setTheme(option.value))}
          >
            <option.icon aria-hidden />
            Theme: {option.label}
            {theme === option.value && <CommandHint>Current</CommandHint>}
          </CommandItem>
        ))}
        {canPreview(me) && (
          <CommandItem
            value="preview"
            keywords={['Preview as role', 'view as']}
            onSelect={onPreviewPage}
          >
            <EyeIcon aria-hidden />
            Preview as role…
          </CommandItem>
        )}
        {access.previewing && (
          <CommandItem
            value="preview:stop"
            keywords={['Stop preview']}
            onSelect={run(actions.stopPreview)}
          >
            <EyeOffIcon aria-hidden />
            Stop preview
          </CommandItem>
        )}
        <CommandItem
          value="shortcuts"
          keywords={['Keyboard shortcuts', 'help keys']}
          onSelect={() => shellUi.open('shortcuts')}
        >
          <KeyboardIcon aria-hidden />
          Keyboard shortcuts
          <CommandHint>?</CommandHint>
        </CommandItem>
        <CommandItem
          value="sign-out-others"
          keywords={['Sign out everywhere else', 'other devices sessions']}
          onSelect={run(actions.signOutEverywhereElse)}
        >
          <LaptopMinimalIcon aria-hidden />
          Sign out everywhere else
        </CommandItem>
        <CommandItem
          value="sign-out"
          keywords={['Sign out', 'log out']}
          onSelect={run(() => void actions.signOut())}
        >
          <LogOutIcon aria-hidden />
          Sign out
        </CommandItem>
      </CommandGroup>
    </>
  )
}
