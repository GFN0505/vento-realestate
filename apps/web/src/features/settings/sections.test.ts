import { defaultPermissions, defaultRole } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  type SettingsSection,
  settingsLanding,
  showsSettingsNav,
  visibleSections,
} from './sections'

const access = (key: 'owner' | 'admin' | 'sales', allEntities = true) => ({
  permissions: defaultPermissions(defaultRole(key)),
  allEntities,
})

const fake = (label: string): SettingsSection => ({
  key: 'team',
  label,
  group: 'organization',
  to: '/settings/team',
  can: () => true,
})

describe('settings sections', () => {
  it('lists the organization sections, then My security, for owners and admins', () => {
    const order = [
      'Organization',
      'Companies',
      'Team',
      'Roles & permissions',
      'Approval rules',
      'Audit log',
      'My security',
    ]
    expect(visibleSections(access('owner')).map((s) => s.label)).toEqual(order)
    expect(visibleSections(access('admin')).map((s) => s.label)).toEqual(order)
  })

  it('hides the audit log from an admin limited to some companies', () => {
    const labels = visibleSections(access('admin', false)).map((s) => s.label)
    expect(labels).toContain('Approval rules')
    expect(labels).not.toContain('Audit log')
  })

  it('lists only My security for a role without settings view, with no sub-navigation', () => {
    const sections = visibleSections(access('sales'))
    expect(sections.map((s) => s.label)).toEqual(['My security'])
    expect(showsSettingsNav(sections)).toBe(false)
  })

  it('sends /settings to My security for a role without settings view, on any screen', () => {
    const sections = visibleSections(access('sales'))
    expect(settingsLanding(sections, false)).toBe('/settings/security')
    expect(settingsLanding(sections, true)).toBe('/settings/security')
  })

  it('keeps My security last, in its own group after the organization sections', () => {
    const sections = visibleSections(access('owner'))
    expect(sections.at(-1)?.group).toBe('personal')
    expect(sections.slice(0, -1).every((s) => s.group === 'organization')).toBe(true)
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
