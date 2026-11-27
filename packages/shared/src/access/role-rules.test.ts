import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLES, defaultPermissions, defaultRole } from './default-roles'
import { emptyPermissionSet, type PermissionSet } from './permissions'
import {
  changeCount,
  customRolePluralName,
  isEmptyPermissionSet,
  normalisePermissions,
  permissionChanges,
  permissionsBeyond,
  roleNeedsTwoStep,
  toggleCell,
  withinPermissions,
} from './role-rules'

const perms = (key: Parameters<typeof defaultRole>[0]): PermissionSet =>
  defaultPermissions(defaultRole(key))

describe('normalisePermissions', () => {
  it('adds view to any module with an action, orders actions and drops duplicates', () => {
    const set = normalisePermissions({ projects: ['export', 'create', 'create'] })
    expect(set.projects).toEqual(['view', 'create', 'export'])
    expect(set.sales).toEqual([])
  })

  it('leaves an already normal set unchanged', () => {
    expect(normalisePermissions(perms('finance'))).toEqual(perms('finance'))
  })
})

describe('isEmptyPermissionSet', () => {
  it('is true only when no module has an action', () => {
    expect(isEmptyPermissionSet(emptyPermissionSet())).toBe(true)
    expect(isEmptyPermissionSet({ ...emptyPermissionSet(), documents: ['view'] })).toBe(false)
  })
})

describe('toggleCell', () => {
  it('ticking Create also ticks View', () => {
    expect(toggleCell(emptyPermissionSet(), 'documents', 'create', true).documents).toEqual([
      'view',
      'create',
    ])
  })

  it('unticking View clears the whole row', () => {
    expect(toggleCell(perms('project_manager'), 'projects', 'view', false).projects).toEqual([])
  })

  it('unticking Create keeps View and the rest', () => {
    expect(toggleCell(perms('sales'), 'sales', 'create', false).sales).toEqual([
      'view',
      'edit',
      'export',
    ])
  })

  it('does not change other modules', () => {
    const before = perms('sales')
    const after = toggleCell(before, 'finance', 'view', true)
    expect({ ...after, finance: before.finance }).toEqual(before)
  })
})

describe('permissionsBeyond', () => {
  it('finds nothing beyond an owner', () => {
    for (const role of DEFAULT_ROLES) {
      expect(withinPermissions(perms('owner'), defaultPermissions(role))).toBe(true)
    }
  })

  it('lists what Sales lacks compared with a Project manager', () => {
    expect(permissionsBeyond(perms('sales'), perms('project_manager'))).toEqual([
      { module: 'projects', action: 'create' },
      { module: 'projects', action: 'edit' },
      { module: 'projects', action: 'delete' },
      { module: 'projects', action: 'export' },
      { module: 'projects', action: 'approve' },
      { module: 'facility', action: 'view' },
    ])
    expect(withinPermissions(perms('sales'), perms('project_manager'))).toBe(false)
  })

  it('treats an equal set as within the ceiling', () => {
    expect(permissionsBeyond(perms('hr'), perms('hr'))).toEqual([])
  })
})

describe('roleNeedsTwoStep', () => {
  it.each(DEFAULT_ROLES.map((r) => [r.key, r] as const))(
    'agrees with the built-in %s role',
    (_key, role) => {
      expect(roleNeedsTwoStep(defaultPermissions(role))).toBe(role.requiresTwoStep)
    },
  )

  it('is needed for Settings: Edit, Finance: Export or HR: Approve, not for Finance: View', () => {
    const view = { ...emptyPermissionSet(), finance: ['view'] } as PermissionSet
    expect(roleNeedsTwoStep(view)).toBe(false)
    expect(roleNeedsTwoStep({ ...view, finance: ['view', 'export'] })).toBe(true)
    expect(roleNeedsTwoStep({ ...view, hr: ['view', 'approve'] })).toBe(true)
    expect(roleNeedsTwoStep({ ...view, settings: ['view', 'edit'] })).toBe(true)
    expect(roleNeedsTwoStep({ ...view, settings: ['view'] })).toBe(false)
  })

  it('is needed for Approve in any module, so every approver signs in with two-step', () => {
    const view = { ...emptyPermissionSet(), projects: ['view'] } as PermissionSet
    expect(roleNeedsTwoStep(view)).toBe(false)
    expect(roleNeedsTwoStep({ ...view, projects: ['view', 'approve'] })).toBe(true)
    expect(roleNeedsTwoStep({ ...view, documents: ['view', 'approve'] })).toBe(true)
    expect(roleNeedsTwoStep({ ...view, projects: ['view', 'create', 'edit', 'export'] })).toBe(
      false,
    )
  })

  it('requires two-step for the built-in roles that approve: Land & legal, Project manager, Facility', () => {
    expect(roleNeedsTwoStep(perms('land_legal'))).toBe(true)
    expect(roleNeedsTwoStep(perms('project_manager'))).toBe(true)
    expect(roleNeedsTwoStep(perms('facility'))).toBe(true)
    expect(roleNeedsTwoStep(perms('sales'))).toBe(false)
    expect(roleNeedsTwoStep(perms('viewer'))).toBe(false)
  })
})

describe('permissionChanges', () => {
  it('counts the Site engineer example (J-ONB-08) as 3 changes', () => {
    const before = perms('project_manager')
    let after = toggleCell(before, 'sales', 'view', false)
    after = toggleCell(after, 'land', 'view', false)
    after = toggleCell(after, 'documents', 'create', true)
    const changes = permissionChanges(before, after)
    expect(changes).toEqual([
      { module: 'land', added: [], removed: ['view'] },
      { module: 'sales', added: [], removed: ['view'] },
      { module: 'documents', added: ['create'], removed: [] },
    ])
    expect(changeCount(changes)).toBe(3)
  })

  it('reports nothing for identical sets', () => {
    expect(permissionChanges(perms('viewer'), perms('viewer'))).toEqual([])
  })
})

describe('customRolePluralName', () => {
  it('reads naturally in "Only … can"', () => {
    expect(customRolePluralName('Site engineer')).toBe('people with the Site engineer role')
  })
})
