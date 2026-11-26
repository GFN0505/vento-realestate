import type { NavAccess } from '@/features/shell/nav'
import { can } from '@/lib/permissions'

/*
 * The settings sections, in the order they appear (spec "Settings layout"). Only sections that
 * are built go here, and each says who can view it, so the sub-navigation, the phone list, the
 * `/settings` redirect and ⌘K never show a section someone can't open (decision 12). My security
 * joins in 3d.
 */

export type SettingsPath =
  | '/settings/organization'
  | '/settings/companies'
  | '/settings/team'
  | '/settings/roles'

export type SettingsKey = 'organization' | 'companies' | 'team' | 'roles'

export type SettingsSection = {
  key: SettingsKey
  label: string
  /** One line for the phone list (board SettingsMobile). */
  summary: string
  to: SettingsPath
  /** Extra words ⌘K matches on. */
  keywords: readonly string[]
  can: (access: Pick<NavAccess, 'permissions'>) => boolean
}

const canViewSettings = (access: Pick<NavAccess, 'permissions'>) =>
  can(access.permissions, 'settings', 'view')

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: 'organization',
    label: 'Organization',
    summary: 'Name, head office and financial year',
    to: '/settings/organization',
    keywords: ['organization', 'profile', 'financial year', 'head office', 'group'],
    can: canViewSettings,
  },
  {
    key: 'companies',
    label: 'Companies',
    summary: 'Your holding company and SPVs',
    to: '/settings/companies',
    // "entity" stays a keyword so people who say it still find the page (decision 0018).
    keywords: ['companies', 'spv', 'entity', 'entities', 'rc number', 'tin', 'vat'],
    can: canViewSettings,
  },
  {
    key: 'team',
    label: 'Team',
    summary: 'People, invitations and what each one can see',
    to: '/settings/team',
    keywords: ['members', 'people', 'users', 'invite', 'invitations', 'staff'],
    can: canViewSettings,
  },
  {
    key: 'roles',
    label: 'Roles & permissions',
    summary: 'What each role can do',
    to: '/settings/roles',
    keywords: ['roles', 'permissions', 'access', 'custom role', 'two-step'],
    can: canViewSettings,
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
