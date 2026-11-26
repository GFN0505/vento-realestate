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

const fake = (label: string): SettingsSection => ({
  key: 'team',
  label,
  summary: '',
  to: '/settings/team',
  keywords: [],
  can: () => true,
})

describe('settings sections', () => {
  it('lists the four sections in order for owners and admins', () => {
    const order = ['Organization', 'Companies', 'Team', 'Roles & permissions']
    expect(visibleSections(access('owner')).map((s) => s.label)).toEqual(order)
    expect(visibleSections(access('admin')).map((s) => s.label)).toEqual(order)
  })

  it('lists nothing for a role without settings view', () => {
    expect(visibleSections(access('sales'))).toEqual([])
  })

  it('opens Organization on larger screens and the section list on phones', () => {
    const sections = visibleSections(access('owner'))
    expect(showsSettingsNav(sections)).toBe(true)
    expect(settingsLanding(sections, false)).toBe('/settings/organization')
    expect(settingsLanding(sections, true)).toBe('list')
  })

  it('draws no sub-navigation and opens the section directly while there is one', () => {
    const one = [fake('Team')]
    expect(showsSettingsNav(one)).toBe(false)
    expect(settingsLanding(one, false)).toBe('/settings/team')
    expect(settingsLanding(one, true)).toBe('/settings/team')
  })

  it('has nowhere to land without a section', () => {
    expect(settingsLanding([], false)).toBeNull()
  })
})
