import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import {
  Building2Icon,
  BuildingIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  KeyboardIcon,
  LaptopMinimalIcon,
  LayersIcon,
  ListChecksIcon,
  LogOutIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShieldPlusIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'
import { PreviewRoles } from '@/components/shell/preview-roles'
import { THEME_OPTIONS } from '@/components/shell/theme-icons'
import { CommandGroup, CommandHint, CommandItem } from '@/components/ui/command'
import { checklistQuery } from '@/features/checklist/checklist-queries'
import { showChecklist } from '@/features/checklist/checklist-visibility'
import { openAddCompany } from '@/features/companies/open-add-company'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useSwitchOrganization } from '@/features/organization/switch-organization'
import { UpgradeHintRows } from '@/features/plan/upgrade-hint-rows'
import {
  canPreview,
  rolesQuery,
  useEffectiveAccess,
  useMe,
} from '@/features/preview/use-effective-permissions'
import { type SettingsKey, type SettingsPath, visibleSections } from '@/features/settings/sections'
import { can } from '@/lib/permissions'
import { setTheme, useTheme } from '@/lib/theme'
import { canView, type NavPath, navItemForModule, navTag, visibleNav } from './nav'
import { readRecentPages } from './recent-pages'
import { shellUi } from './shell-ui'
import { useShellActions } from './use-shell-actions'

const SECTION_ICONS: Record<SettingsKey, typeof UsersIcon> = {
  organization: Building2Icon,
  companies: BuildingIcon,
  team: UsersIcon,
  roles: ShieldCheckIcon,
}

type Props = {
  page: 'root' | 'preview'
  search: string
  onPreviewPage: () => void
  close: () => void
  navigate: (to: NavPath | SettingsPath) => void
}

/**
 * What ⌘K offers (spec): pages the member can open and the shell's actions. Decision 12: built
 * from the same registry and effective access as the sidebar, so nothing hidden there appears
 * here. The one exception is for owners: "Other plans" rows when they search for something
 * outside their plan. `keywords[0]` is the label the filter ranks on.
 */
export function CommandResults({ page, search, onPreviewPage, close, navigate }: Props) {
  const me = useMe()
  const access = useEffectiveAccess()
  const entity = useCurrentEntity()
  const theme = useTheme()
  const router = useRouter()
  const pathname = useLocation({ select: (l) => l.pathname })
  const actions = useShellActions()
  const switchOrganization = useSwitchOrganization()
  const queryClient = useQueryClient()
  // Settings create: owners and admins by default; never while previewing a role without it.
  const canInvite = can(access.permissions, 'settings', 'create')
  const checklist = useQuery({ ...checklistQuery(), enabled: canInvite })
  const checklistHidden = canInvite && checklist.data?.hidden === true
  const canAddCompany = me.canAddCompany && canInvite
  // New role: settings create and every company (organization-wide, as the server checks).
  const canNewRole = canInvite && me.member?.entityIds === null
  // Roles by name, only once the list is cached: ⌘K never fetches roles itself.
  const canSeeRoles = can(access.permissions, 'settings', 'view')
  const roles = useQuery({ ...rolesQuery(), enabled: false }).data?.items ?? []
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
        return !item || canView(access, item)
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
        {visibleNav(access).map((item) => (
          <CommandItem
            key={item.key}
            value={`go:${item.key}`}
            keywords={[`Go to ${item.label}`, ...item.keywords]}
            onSelect={() => navigate(item.to)}
          >
            <item.icon aria-hidden />
            Go to {item.label}
            {item.key === 'home' && <CommandHint>G then H</CommandHint>}
            {navTag(access, item) === 'early_access' && <CommandHint>Early access</CommandHint>}
          </CommandItem>
        ))}
        {visibleSections(access).map((section) => {
          const Icon = SECTION_ICONS[section.key]
          return (
            <CommandItem
              key={section.key}
              value={`go:settings:${section.key}`}
              keywords={[`Go to ${section.label}`, 'settings', ...section.keywords]}
              onSelect={() => navigate(section.to)}
            >
              <Icon aria-hidden />
              Go to {section.label}
              <CommandHint>Settings</CommandHint>
            </CommandItem>
          )
        })}
      </CommandGroup>
      {canSeeRoles && roles.length > 0 && (
        <CommandGroup heading="Roles">
          {roles.map((role) => (
            <CommandItem
              key={role.id}
              value={`role:${role.id}`}
              keywords={[`${role.name} role`, 'roles permissions access']}
              onSelect={run(
                () =>
                  void router.navigate({
                    to: '/settings/roles/$roleId',
                    params: { roleId: role.id },
                  }),
              )}
            >
              <ShieldCheckIcon aria-hidden />
              <span className="truncate">{role.name} role</span>
              {!role.isSystem && <CommandHint>Custom</CommandHint>}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      <CommandGroup heading="Actions">
        {canInvite && (
          <CommandItem
            value="invite"
            keywords={['Invite people', 'invite team members add user colleague staff']}
            onSelect={() => shellUi.openInvite()}
          >
            <UserPlusIcon aria-hidden />
            Invite people
          </CommandItem>
        )}
        {canAddCompany && (
          <CommandItem
            value="company:add"
            keywords={['Add company', 'new company spv entity holding']}
            onSelect={run(() => openAddCompany(access.showUpgradeHints ? me.plan : null))}
          >
            <PlusIcon aria-hidden />
            Add company
          </CommandItem>
        )}
        {canNewRole && (
          <CommandItem
            value="role:new"
            keywords={['New role', 'create custom role permissions duplicate']}
            onSelect={run(
              () => void router.navigate({ to: '/settings/roles', search: { new: true } }),
            )}
          >
            <ShieldPlusIcon aria-hidden />
            New role
          </CommandItem>
        )}
        {checklistHidden && (
          <CommandItem
            value="checklist:show"
            keywords={['Show setup checklist', 'finish setting up onboarding']}
            onSelect={run(() => {
              void showChecklist(queryClient).then(() => router.navigate({ to: '/' }))
            })}
          >
            <ListChecksIcon aria-hidden />
            Show setup checklist
          </CommandItem>
        )}
        {!entity.locked && entity.status === 'success' && (
          <>
            {entity.entity && (
              <CommandItem
                value="entity:all"
                keywords={['Show all companies', 'switch company entity']}
                onSelect={run(() => entity.select(null))}
              >
                <LayersIcon aria-hidden />
                Show all companies
                <CommandHint>Company</CommandHint>
              </CommandItem>
            )}
            {entity.options
              .filter((e) => e.id !== entity.entity?.id)
              .map((e) => (
                <CommandItem
                  key={e.id}
                  value={`entity:${e.id}`}
                  keywords={[`Switch to ${e.name}`, 'switch company entity spv']}
                  onSelect={run(() => entity.select(e.id))}
                >
                  <LayersIcon aria-hidden />
                  <span className="truncate">Switch to {e.name}</span>
                  <CommandHint>Company</CommandHint>
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
      {access.showUpgradeHints && <UpgradeHintRows search={search} close={close} />}
    </>
  )
}
