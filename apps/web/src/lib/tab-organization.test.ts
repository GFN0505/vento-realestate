import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectedOrganizationId,
  forgetTabOrganization,
  organizationNotice,
  reloadForOrganizationChange,
  resetTabOrganizationForTests,
  syncTabOrganization,
  takeOrganizationNotice,
} from './tab-organization'

const vento = { id: 'org-vento', name: 'Vento Homes Ltd' }
const lekki = { id: 'org-lekki', name: 'Lekki Partners Ltd' }

function me(organization: typeof vento | null, organizations = [vento, lekki], userId = 'user-1') {
  return { user: { id: userId }, organization, organizations }
}

const replace = vi.fn()

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  resetTabOrganizationForTests()
  replace.mockReset()
  vi.stubGlobal('location', { ...window.location, replace })
})
afterEach(() => vi.unstubAllGlobals())

describe('organization notice', () => {
  it('says nothing when the tab still shows the same organization', () => {
    expect(organizationNotice(vento, vento, [vento])).toBeNull()
  })

  it('says the person switched in another tab when they still belong to the old one', () => {
    expect(organizationNotice(vento, lekki, [vento, lekki])).toBe(
      'You switched to Lekki Partners Ltd in another tab.',
    )
  })

  it('says access ended when the old organization is gone from their list', () => {
    expect(organizationNotice(vento, lekki, [lekki])).toBe(
      'You no longer have access to Vento Homes Ltd.',
    )
    expect(organizationNotice(vento, null, [])).toBe(
      'You no longer have access to Vento Homes Ltd.',
    )
  })
})

describe('tab binding', () => {
  it('binds on first load and sends that organization afterwards', () => {
    expect(syncTabOrganization(me(vento))).toBe('ok')
    expect(expectedOrganizationId()).toBe(vento.id)
    expect(takeOrganizationNotice()).toBeNull()
  })

  it('after a reload, tells the person they switched in another tab', () => {
    syncTabOrganization(me(vento))
    resetTabOrganizationForTests() // a page load: memory gone, sessionStorage kept
    syncTabOrganization(me(lekki))
    expect(takeOrganizationNotice()).toBe('You switched to Lekki Partners Ltd in another tab.')
    expect(takeOrganizationNotice()).toBeNull()
  })

  it('reloads when the session moves to another organization while the page is open', () => {
    syncTabOrganization(me(vento))
    expect(syncTabOrganization(me(lekki))).toBe('reload')
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('reloads only once per page load', () => {
    reloadForOrganizationChange()
    reloadForOrganizationChange()
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('binds without reloading when onboarding creates the first organization', () => {
    syncTabOrganization(me(null, []))
    expect(syncTabOrganization(me(vento, [vento]))).toBe('ok')
    expect(replace).not.toHaveBeenCalled()
    expect(expectedOrganizationId()).toBe(vento.id)
  })

  it('tells someone removed from their organization after they sign in again', () => {
    syncTabOrganization(me(vento))
    forgetTabOrganization() // signed out; the device still remembers the last organization
    resetTabOrganizationForTests()
    syncTabOrganization(me(lekki, [lekki]))
    expect(takeOrganizationNotice()).toBe('You no longer have access to Vento Homes Ltd.')
  })

  it("never shows one person's notice to another on the same tab", () => {
    syncTabOrganization(me(vento))
    resetTabOrganizationForTests()
    syncTabOrganization(me(lekki, [lekki], 'user-2'))
    expect(takeOrganizationNotice()).toBeNull()
  })
})
