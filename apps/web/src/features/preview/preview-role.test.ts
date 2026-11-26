import type { Role } from '@vento/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { testMe, testRoles } from '@/test/me'
import { clearPreview, getPreview, resetPreviewForTests, startPreview } from './preview-role'
import { effectiveAccess } from './use-effective-permissions'

const roles: Role[] = testRoles().map((r) => ({ ...r, canApprove: [] }))

const me = testMe

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

describe('availability in effective access', () => {
  it("carries the organization's features and internal flag, also while previewing", () => {
    const owner = testMe('owner', {
      features: [{ key: 'sales', earlyAccess: true }],
      organization: { id: 'org-a', name: 'Lekki Partners Ltd', internal: true },
    })
    const access = effectiveAccess(owner, roles, { organizationId: 'org-a', roleId: 'role-sales' })
    expect(access.features.get('sales')).toEqual({ earlyAccess: true })
    expect(access.features.has('finance')).toBe(false)
    expect(access.internal).toBe(true)
  })

  it('offers upgrade hints to an owner', () => {
    expect(effectiveAccess(testMe('owner'), roles, null).showUpgradeHints).toBe(true)
  })

  it('offers none to other roles, even with a plan block', () => {
    const admin = testMe('admin', { plan: testMe('owner').plan })
    expect(effectiveAccess(admin, roles, null).showUpgradeHints).toBe(false)
    expect(effectiveAccess(testMe('sales'), roles, null).showUpgradeHints).toBe(false)
  })

  it('offers none while an owner previews another role', () => {
    const preview = { organizationId: 'org-a', roleId: 'role-sales' }
    expect(effectiveAccess(testMe('owner'), roles, preview).showUpgradeHints).toBe(false)
  })
})
