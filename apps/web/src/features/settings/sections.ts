import type { NavAccess } from '@/features/shell/nav'
import { can } from '@/lib/permissions'

/*
 * The settings sections, in the order they appear (spec "Settings layout"). Only sections that
 * are built go here, and each says who can view it, so the sub-navigation, the phone list, the
 * `/settings` redirect and ⌘K never show a section someone can't open (decision 12). Later bricks
 * add Organization, Entities, Roles & permissions (3c) and My security (3d) here.
 */

export type SettingsPath = '/settings/team'

export type SettingsSection = {
  key: 'team'
  label: string
  /** One line for the phone list (board SettingsMobile). */
  summary: string
  to: SettingsPath
  /** Extra words ⌘K matches on. */
  keywords: readonly string[]
  can: (access: Pick<NavAccess, 'permissions'>) => boolean
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: 'team',
    label: 'Team',
    summary: 'People, invitations and what each one can see',
    to: '/settings/team',
    keywords: ['members', 'people', 'users', 'invite', 'invitations', 'staff'],
    can: (access) => can(access.permissions, 'settings', 'view'),
  },
]

export function visibleSections(access: Pick<NavAccess, 'permissions'>): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => section.can(access))
}

/**
 * A menu with one entry is clutter: the sub-navigation (and the phone list) appear only once a
 * member can open two or more sections.
 */
export function showsSettingsNav(sections: readonly SettingsSection[]): boolean {
  return sections.length >= 2
}

/** Where `/settings` goes: the phone list when there's a choice to make, else the first section. */
export function settingsLanding(
  sections: readonly SettingsSection[],
  phone: boolean,
): SettingsPath | 'list' | null {
  const first = sections[0]
  if (!first) return null
  return phone && showsSettingsNav(sections) ? 'list' : first.to
}
