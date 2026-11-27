import type { NavAccess } from '@/features/shell/nav'
import { can } from '@/lib/permissions'

/*
 * The settings sections, in the order they appear (spec "Settings layout"). Only sections that
 * are built go here, and each says who can view it, so the sub-navigation, the phone list, the
 * `/settings` redirect and ⌘K never show a section someone can't open (decision 12). My security
 * (3d) is personal: everyone can open it, so it's last, after a divider, and it's where `/settings`
 * lands for people without settings access.
 */

export type SettingsPath =
  | '/settings/organization'
  | '/settings/companies'
  | '/settings/team'
  | '/settings/roles'
  | '/settings/approval-rules'
  | '/settings/audit-log'
  | '/settings/security'

export type SettingsKey =
  | 'organization'
  | 'companies'
  | 'team'
  | 'roles'
  | 'approval-rules'
  | 'audit-log'
  | 'security'

type SectionAccess = Pick<NavAccess, 'permissions' | 'allEntities'>

export type SettingsSection = {
  key: SettingsKey
  label: string
  /** The organization's sections, then the person's own (drawn after a divider). */
  group: 'organization' | 'personal'
  /** One line for the phone list (board SettingsMobile). */
  summary: string
  to: SettingsPath
  /** Extra words ⌘K matches on. */
  keywords: readonly string[]
  can: (access: SectionAccess) => boolean
}

const canViewSettings = (access: SectionAccess) => can(access.permissions, 'settings', 'view')

/**
 * The audit log shows sign-ins and changes across companies: Settings edit and every company
 * (spec open question 1). The server refuses anyone else.
 */
export const canSeeAuditLog = (access: SectionAccess) =>
  can(access.permissions, 'settings', 'edit') && access.allEntities === true

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: 'organization',
    label: 'Organization',
    group: 'organization',
    summary: 'Name, head office and financial year',
    to: '/settings/organization',
    keywords: ['organization', 'profile', 'financial year', 'head office', 'group'],
    can: canViewSettings,
  },
  {
    key: 'companies',
    label: 'Companies',
    group: 'organization',
    summary: 'Your holding company and SPVs',
    to: '/settings/companies',
    // "entity" stays a keyword so people who say it still find the page (decision 0018).
    keywords: ['companies', 'spv', 'entity', 'entities', 'rc number', 'tin', 'vat'],
    can: canViewSettings,
  },
  {
    key: 'team',
    label: 'Team',
    group: 'organization',
    summary: 'People, invitations and what each one can see',
    to: '/settings/team',
    keywords: ['members', 'people', 'users', 'invite', 'invitations', 'staff'],
    can: canViewSettings,
  },
  {
    key: 'roles',
    label: 'Roles & permissions',
    group: 'organization',
    summary: 'What each role can do',
    to: '/settings/roles',
    keywords: ['roles', 'permissions', 'access', 'custom role', 'two-step'],
    can: canViewSettings,
  },
  {
    key: 'approval-rules',
    label: 'Approval rules',
    group: 'organization',
    summary: 'Which changes need a second person',
    to: '/settings/approval-rules',
    keywords: ['approvers', 'maker checker', 'limits'],
    // Owners edit; everyone else with Settings view reads (spec open question 1).
    can: canViewSettings,
  },
  {
    key: 'audit-log',
    label: 'Audit log',
    group: 'organization',
    summary: 'Who changed what, and when',
    to: '/settings/audit-log',
    keywords: ['history', 'who changed', 'activity', 'export'],
    can: canSeeAuditLog,
  },
  {
    key: 'security',
    label: 'My security',
    group: 'personal',
    summary: 'Password, two-step, passkeys and devices',
    to: '/settings/security',
    keywords: [
      'password',
      'passkey',
      'two-step',
      'sessions',
      'devices',
      'sign out',
      'backup codes',
      'account',
      'profile',
      'name',
    ],
    // Personal: no permission needed, also while previewing a role (spec).
    can: () => true,
  },
]

export function visibleSections(access: SectionAccess): SettingsSection[] {
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
