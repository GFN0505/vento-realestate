import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROLES,
  defaultPermissions,
  defaultRole,
  defaultRoleAllows,
  SYSTEM_ROLE_KEYS,
} from './default-roles'
import { approvableModules, PERMISSION_MODULES } from './permissions'

describe('default roles', () => {
  it('ships the nine built-in roles in the spec order', () => {
    expect(DEFAULT_ROLES.map((r) => r.key)).toEqual([...SYSTEM_ROLE_KEYS])
  })

  it('requires two-step for owner, admin, finance and HR only', () => {
    const required = DEFAULT_ROLES.filter((r) => r.requiresTwoStep).map((r) => r.key)
    expect(required).toEqual(['owner', 'admin', 'finance', 'hr'])
  })

  it('gives every role a level for every module', () => {
    for (const role of DEFAULT_ROLES) {
      expect(Object.keys(role.levels).sort()).toEqual([...PERMISSION_MODULES].sort())
    }
  })

  it('keeps Settings to owners and admins', () => {
    const settings = SYSTEM_ROLE_KEYS.filter((k) => defaultRoleAllows(k, 'settings', 'view'))
    expect(settings).toEqual(['owner', 'admin'])
  })

  it('lets finance approve in Sales, Finance and HR', () => {
    expect(approvableModules(defaultPermissions(defaultRole('finance')))).toEqual([
      'sales',
      'finance',
      'hr',
    ])
  })

  it('gives sales Edit (no delete or approve) in Sales & CRM', () => {
    expect(defaultPermissions(defaultRole('sales')).sales).toEqual([
      'view',
      'create',
      'edit',
      'export',
    ])
  })

  it('keeps viewers out of HR & payroll and lets them change nothing', () => {
    const viewer = defaultPermissions(defaultRole('viewer'))
    expect(viewer.hr).toEqual([])
    expect(
      Object.values(viewer)
        .flat()
        .every((a) => a === 'view'),
    ).toBe(true)
  })

  it('gives HR full HR & payroll and view of documents only', () => {
    const hr = defaultPermissions(defaultRole('hr'))
    const modules = PERMISSION_MODULES.filter((m) => hr[m].length > 0)
    expect(modules).toEqual(['hr', 'documents'])
  })
})
