import {
  DEFAULT_ROLES,
  defaultPermissions,
  defaultRole,
  defaultRoleAllows,
  PERMISSION_MODULES,
  type PermissionSet,
  SYSTEM_ROLE_KEYS,
  type SystemRoleKey,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { canView, mobileTabs, moreItems, NAV, sidebarSections, visibleNav } from './nav'
import { NAV_PATHS } from './nav-paths'

const perms = (key: SystemRoleKey) => defaultPermissions(defaultRole(key))
const labels = (items: { label: string }[]) => items.map((i) => i.label)

describe('sidebar', () => {
  it.each(SYSTEM_ROLE_KEYS)('shows exactly the modules %s can view, in spec order', (key) => {
    const expected = NAV.filter(
      (i) => i.module === null || defaultRoleAllows(key, i.module, 'view'),
    )
    const shown = sidebarSections(perms(key)).flatMap((s) => s.items)
    expect(labels(shown)).toEqual(labels(expected))
  })

  it('groups the sidebar only when it has more than six entries', () => {
    const grouped = DEFAULT_ROLES.filter(
      (r) => sidebarSections(perms(r.key))[0]?.heading !== 'Workspace',
    )
    expect(grouped.map((r) => r.key)).toEqual([
      'owner',
      'admin',
      'project_manager',
      'finance',
      'viewer',
    ])
  })

  it('uses the spec headings for a grouped sidebar', () => {
    expect(sidebarSections(perms('owner')).map((s) => s.heading)).toEqual([
      'Overview',
      'Land & assets',
      'Revenue',
      'People & governance',
    ])
  })

  it('never shows a module the role cannot view', () => {
    expect(labels(visibleNav(perms('sales')))).not.toContain('HR & payroll')
    expect(labels(visibleNav(perms('hr')))).toEqual(['Home', 'HR & payroll', 'Documents'])
  })

  it('shows only Home to someone with no permissions', () => {
    expect(labels(visibleNav(null))).toEqual(['Home'])
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
    const custom = { ...perms('viewer'), land: [] } satisfies PermissionSet
    expect(labels(mobileTabs(custom, null))).toEqual(['Home', 'Projects', 'Estates', 'Sales'])
  })

  it('drops a priority module the role cannot view', () => {
    const noSales = { ...perms('sales'), sales: [] } satisfies PermissionSet
    expect(labels(mobileTabs(noSales, 'sales'))).toEqual(['Home', 'Documents', 'Compliance'])
  })

  it('puts every other viewable module in More, and nothing twice', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      const tabs = labels(mobileTabs(perms(key), key))
      const more = labels(moreItems(perms(key), key))
      expect([...tabs, ...more].sort()).toEqual(labels(visibleNav(perms(key))).sort())
    }
  })
})

describe('hidden modules', () => {
  it('hides a module everywhere when its status is hidden', () => {
    const sales = NAV.find((i) => i.key === 'sales')
    if (!sales) throw new Error('Sales must be in the registry')
    expect(canView(perms('owner'), { ...sales, status: 'hidden' })).toBe(false)
  })

  it('maps every permission module except settings to one entry', () => {
    const modules = NAV.flatMap((i) => (i.module ? [i.module] : []))
    expect([...modules, 'settings'].sort()).toEqual([...PERMISSION_MODULES].sort())
  })
})

describe('addresses', () => {
  it('lists every registry address in the guard list, in order', () => {
    expect(NAV.map((i) => i.to)).toEqual([...NAV_PATHS])
  })
})
