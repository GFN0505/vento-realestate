import { DEFAULT_ROLES, defaultPermissions, defaultRole, type Me, type Role } from '@vento/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { clearPreview, getPreview, resetPreviewForTests, startPreview } from './preview-role'
import { effectiveAccess } from './use-effective-permissions'

const roles: Role[] = DEFAULT_ROLES.map((r) => ({
  id: `role-${r.key}`,
  key: r.key,
  name: r.name,
  pluralName: r.pluralName,
  description: r.description,
  isSystem: true,
  requiresTwoStep: r.requiresTwoStep,
  permissions: defaultPermissions(r),
  canApprove: [],
}))

function me(roleKey: 'admin' | 'sales'): Me {
  return {
    user: {
      id: 'u',
      name: 'Olumide Bankole',
      email: 'o@v.ng',
      twoFactorEnabled: true,
      companyName: null,
    },
    organization: { id: 'org-a', name: 'Vento Homes Ltd' },
    organizations: [{ id: 'org-a', name: 'Vento Homes Ltd', roleName: 'Admin' }],
    member: {
      id: 'm',
      role: { id: `role-${roleKey}`, key: roleKey, name: defaultRole(roleKey).name },
      entityIds: null,
      permissions: defaultPermissions(defaultRole(roleKey)),
    },
    nextStep: 'ready',
    twoStepRequired: false,
  }
}

afterEach(() => {
  clearPreview()
  resetPreviewForTests()
  sessionStorage.clear()
})

describe('preview as role', () => {
  it("shows the previewed role's navigation to an admin", () => {
    const access = effectiveAccess(me('admin'), roles, {
      organizationId: 'org-a',
      roleId: 'role-sales',
    })
    expect(access.roleName).toBe('Sales')
    expect(access.permissions?.hr).toEqual([])
    expect(access.permissions?.sales).toContain('view')
  })

  it('is ignored for someone without Settings view', () => {
    const access = effectiveAccess(me('sales'), roles, {
      organizationId: 'org-a',
      roleId: 'role-admin',
    })
    expect(access.previewing).toBeNull()
    expect(access.permissions?.hr).toEqual([])
  })

  it('is ignored when stored for another organization', () => {
    startPreview('org-b', 'role-sales')
    expect(getPreview('org-a')).toBeNull()
    expect(getPreview('org-b')).toEqual({ organizationId: 'org-b', roleId: 'role-sales' })
  })

  it('survives a reload of the tab and ends on Stop preview', () => {
    startPreview('org-a', 'role-sales')
    expect(sessionStorage.getItem('vento-preview')).toContain('role-sales')
    clearPreview()
    expect(getPreview('org-a')).toBeNull()
    expect(sessionStorage.getItem('vento-preview')).toBeNull()
  })
})
