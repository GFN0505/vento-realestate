import { defaultPermissions, defaultRole } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  type SettingsSection,
  settingsLanding,
  showsSettingsNav,
  visibleSections,
} from './sections'

const access = (key: 'owner' | 'admin' | 'sales') => ({
  permissions: defaultPermissions(defaultRole(key)),
})

const fake = (key: string): SettingsSection => ({
  key: 'team',
  label: key,
  summary: '',
  to: '/settings/team',
  keywords: [],
  can: () => true,
})

describe('settings sections', () => {
  it('lists Team for owners and admins', () => {
    expect(visibleSections(access('owner')).map((s) => s.label)).toEqual(['Team'])
    expect(visibleSections(access('admin')).map((s) => s.label)).toEqual(['Team'])
  })

  it('lists nothing for a role without settings view', () => {
    expect(visibleSections(access('sales'))).toEqual([])
  })

  it('draws no sub-navigation and opens the section directly while there is one', () => {
    const one = visibleSections(access('owner'))
    expect(showsSettingsNav(one)).toBe(false)
    expect(settingsLanding(one, false)).toBe('/settings/team')
    expect(settingsLanding(one, true)).toBe('/settings/team')
  })

  it('draws the sub-navigation and the phone list from two sections', () => {
    const two = [fake('Team'), fake('Roles & permissions')]
    expect(showsSettingsNav(two)).toBe(true)
    expect(settingsLanding(two, false)).toBe('/settings/team')
    expect(settingsLanding(two, true)).toBe('list')
  })

  it('has nowhere to land without a section', () => {
    expect(settingsLanding([], false)).toBeNull()
  })
})
