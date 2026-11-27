import type { SettingsKey } from './sections'

/*
 * Words only the phone list (board SettingsMobile) and ⌘K need, kept out of the first load like
 * NAV_COPY: route guards read `sections.ts` in the entry bundle.
 */
export const SECTION_COPY: Record<SettingsKey, { summary: string; keywords: readonly string[] }> = {
  organization: {
    summary: 'Name, head office and financial year',
    keywords: ['organization', 'profile', 'financial year', 'head office', 'group'],
  },
  companies: {
    summary: 'Your holding company and SPVs',
    // "entity" stays a keyword so people who say it still find the page (decision 0018).
    keywords: ['companies', 'spv', 'entity', 'entities', 'rc number', 'tin', 'vat'],
  },
  team: {
    summary: 'People, invitations and what each one can see',
    keywords: ['members', 'people', 'users', 'invite', 'invitations', 'staff'],
  },
  roles: {
    summary: 'What each role can do',
    keywords: ['roles', 'permissions', 'access', 'custom role', 'two-step'],
  },
  'approval-rules': {
    summary: 'Which changes need a second person',
    keywords: ['approvers', 'maker checker', 'limits'],
  },
  'audit-log': {
    summary: 'Who changed what, and when',
    keywords: ['history', 'who changed', 'activity', 'export'],
  },
  security: {
    summary: 'Password, two-step, passkeys and devices',
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
  },
}
