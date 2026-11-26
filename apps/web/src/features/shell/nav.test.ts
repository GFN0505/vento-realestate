import {
  defaultPermissions,
  defaultRole,
  defaultRoleAllows,
  FEATURES,
  PERMISSION_MODULES,
  type PermissionSet,
  SYSTEM_ROLE_KEYS,
  type SystemRoleKey,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { NAV_FLAGS, navAccess } from '@/test/nav-access'
import {
  canView,
  footerNav,
  isAvailable,
  mobileTabs,
  moreItems,
  NAV,
  type NavItem,
  navItem,
  navTag,
  sidebarSections,
  visibleNav,
  workspaceModules,
} from './nav'
import { NAV_PATHS } from './nav-paths'

// The 3a tables: an internal organization with every module available.
const perms = (key: SystemRoleKey) => navAccess(defaultPermissions(defaultRole(key)))
const permsOf = (permissions: PermissionSet | null) => navAccess(permissions)
const rolePerms = (key: SystemRoleKey) => defaultPermissions(defaultRole(key))
const labels = (items: { label: string }[]) => items.map((i) => i.label)

describe('sidebar', () => {
  it.each(SYSTEM_ROLE_KEYS)('shows exactly the modules %s can view, in spec order', (key) => {
    const expected = NAV.filter(
      (i) =>
        i.group !== 'footer' && (i.module === null || defaultRoleAllows(key, i.module, 'view')),
    )
    const shown = sidebarSections(perms(key)).flatMap((s) => s.items)
    expect(labels(shown)).toEqual(labels(expected))
  })

  it('puts Home first, then the modules, without group headings on screen', () => {
    expect(sidebarSections(perms('owner')).map((s) => s.heading)).toEqual(['Overview', 'Modules'])
    expect(labels(sidebarSections(perms('hr'))[1]?.items ?? [])).toEqual([
      'HR & payroll',
      'Documents',
    ])
  })

  it('never shows a module the role cannot view', () => {
    expect(labels(visibleNav(perms('sales')))).not.toContain('HR & payroll')
    expect(labels(visibleNav(perms('hr')))).toEqual(['Home', 'HR & payroll', 'Documents'])
  })

  it('shows only Home to someone with no permissions', () => {
    expect(labels(visibleNav(permsOf(null)))).toEqual(['Home'])
  })
})

describe('mobile tabs', () => {
  const expected: Record<SystemRoleKey, string[]> = {
    owner: ['Home', 'Projects', 'Sales', 'Reports'],
    admin: ['Home', 'Projects', 'Sales', 'Reports'],
    land_legal: ['Home', 'Land & title', 'Documents', 'Compliance'],
    project_manager: ['Home', 'Projects', 'Documents', 'Compliance'],
    sales: ['Home', 'Sales', 'Documents', 'Compliance'],
    finance: ['Home', 'Finance', 'Sales', 'Reports'],
    hr: ['Home', 'HR & payroll', 'Documents'],
    facility: ['Home', 'Estates', 'Projects', 'Documents'],
    viewer: ['Home', 'Projects', 'Sales', 'Reports'],
  }

  it.each(SYSTEM_ROLE_KEYS)('match the spec table for %s', (key) => {
    expect(labels(mobileTabs(perms(key), key))).toEqual(expected[key])
  })

  it('gives a custom role its first three modules in sidebar order', () => {
    const custom = { ...rolePerms('viewer'), land: [] } satisfies PermissionSet
    expect(labels(mobileTabs(permsOf(custom), null))).toEqual([
      'Home',
      'Projects',
      'Estates',
      'Sales',
    ])
  })

  it('drops a priority module the role cannot view', () => {
    const noSales = { ...rolePerms('sales'), sales: [] } satisfies PermissionSet
    expect(labels(mobileTabs(permsOf(noSales), 'sales'))).toEqual([
      'Home',
      'Documents',
      'Compliance',
    ])
  })

  it('puts every other viewable module in More, and nothing twice', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      const tabs = labels(mobileTabs(perms(key), key))
      const more = labels(moreItems(perms(key), key))
      expect([...tabs, ...more].sort()).toEqual(labels(visibleNav(perms(key))).sort())
    }
  })
})

describe('sidebar footer', () => {
  it('hides Settings and Help until they have somewhere real to go', () => {
    for (const key of SYSTEM_ROLE_KEYS) expect(footerNav(perms(key))).toEqual([])
  })

  it('keeps the workspace grid to modules, without Home or the footer', () => {
    expect(labels(workspaceModules(perms('hr')))).toEqual(['HR & payroll', 'Documents'])
  })
})

describe('registry', () => {
  it('maps every permission module to exactly one entry', () => {
    const modules = NAV.flatMap((i) => (i.module ? [i.module] : []))
    expect(modules.sort()).toEqual([...PERMISSION_MODULES].sort())
  })

  it('uses only feature keys the catalog knows', () => {
    for (const flag of NAV_FLAGS) expect(Object.keys(FEATURES)).toContain(flag)
  })
})

const owner = rolePerms('owner')
const built = (item: NavItem): NavItem => ({ ...item, built: true })
const shownEverywhere = (access: ReturnType<typeof navAccess>) => [
  ...labels(sidebarSections(access).flatMap((s) => s.items)),
  ...labels(mobileTabs(access, 'owner')),
  ...labels(moreItems(access, 'owner')),
  ...labels(workspaceModules(access)),
]

describe('availability', () => {
  it('hides a module the organization does not have everywhere, even from an owner', () => {
    const access = navAccess(owner, { features: NAV_FLAGS.filter((f) => f !== 'sales') })
    expect(shownEverywhere(access)).not.toContain('Sales')
    expect(canView(access, navItem('sales'))).toBe(false)
    expect(isAvailable(access, navItem('sales'))).toBe(false)
  })

  it('shows only Home to an organization with nothing available', () => {
    expect(labels(visibleNav(navAccess(owner, { features: [] })))).toEqual(['Home'])
  })

  it('shows unbuilt modules only to internal organizations', () => {
    expect(labels(visibleNav(navAccess(owner, { internal: false })))).toEqual(['Home'])
    expect(canView(navAccess(owner, { internal: false }), built(navItem('sales')))).toBe(true)
  })

  it('keeps unbuilt core entries hidden, even in internal organizations', () => {
    expect(isAvailable(navAccess(owner), navItem('settings'))).toBe(false)
    expect(isAvailable(navAccess(owner), navItem('help'))).toBe(false)
  })

  it('still hides an available module the role cannot view', () => {
    const access = navAccess(rolePerms('hr'), { internal: false })
    expect(isAvailable(access, built(navItem('sales')))).toBe(true)
    expect(canView(access, built(navItem('sales')))).toBe(false)
  })
})

describe('tags', () => {
  it('tags an unbuilt module Soon, ahead of early access', () => {
    const access = navAccess(owner, { earlyAccess: ['sales'] })
    expect(navTag(access, navItem('sales'))).toBe('soon')
  })

  it('tags a built module reached early as Early access', () => {
    const access = navAccess(owner, { earlyAccess: ['sales'] })
    expect(navTag(access, built(navItem('sales')))).toBe('early_access')
  })

  it('gives a released built module and Home no tag', () => {
    expect(navTag(navAccess(owner), built(navItem('sales')))).toBeNull()
    expect(navTag(navAccess(owner), navItem('home'))).toBeNull()
  })
})

describe('addresses', () => {
  it('lists every registry address in the guard list, in order', () => {
    expect(NAV.map((i) => i.to)).toEqual([...NAV_PATHS])
  })
})
