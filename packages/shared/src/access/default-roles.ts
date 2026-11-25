import { z } from 'zod'
import {
  PERMISSION_LEVELS,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionLevel,
  type PermissionModule,
  type PermissionSet,
} from './permissions'

export const SYSTEM_ROLE_KEYS = [
  'owner',
  'admin',
  'land_legal',
  'project_manager',
  'sales',
  'finance',
  'hr',
  'facility',
  'viewer',
] as const
export const systemRoleKey = z.enum(SYSTEM_ROLE_KEYS)
export type SystemRoleKey = z.infer<typeof systemRoleKey>

type Levels = Record<PermissionModule, PermissionLevel>

export type DefaultRole = {
  key: SystemRoleKey
  name: string
  /** For "Only owners and admins can …". */
  pluralName: string
  description: string
  requiresTwoStep: boolean
  levels: Levels
}

// The spec's default table, column by column. Only owners can grant, change or remove the
// owner role; that rule lives in the members and invitations services, not here.
export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    key: 'owner',
    name: 'Owner',
    pluralName: 'owners',
    description: 'Full access to everything, including who can do what.',
    requiresTwoStep: true,
    levels: {
      land: 'full',
      projects: 'full',
      sales: 'full',
      finance: 'full',
      facility: 'full',
      hr: 'full',
      compliance: 'full',
      documents: 'full',
      analytics: 'full',
      settings: 'full',
    },
  },
  {
    key: 'admin',
    name: 'Admin',
    pluralName: 'admins',
    description: 'Full access. Manages the team and settings, but not owners.',
    requiresTwoStep: true,
    levels: {
      land: 'full',
      projects: 'full',
      sales: 'full',
      finance: 'full',
      facility: 'full',
      hr: 'full',
      compliance: 'full',
      documents: 'full',
      analytics: 'full',
      settings: 'full',
    },
  },
  {
    key: 'land_legal',
    name: 'Land & legal',
    pluralName: 'land & legal staff',
    description: 'Land, titles and legal documents.',
    requiresTwoStep: false,
    levels: {
      land: 'full',
      projects: 'view',
      sales: 'view',
      finance: 'none',
      facility: 'none',
      hr: 'none',
      compliance: 'edit',
      documents: 'full',
      analytics: 'none',
      settings: 'none',
    },
  },
  {
    key: 'project_manager',
    name: 'Project manager',
    pluralName: 'project managers',
    description: 'Projects, construction and site work.',
    requiresTwoStep: false,
    levels: {
      land: 'view',
      projects: 'full',
      sales: 'view',
      finance: 'none',
      facility: 'view',
      hr: 'none',
      compliance: 'view',
      documents: 'view',
      analytics: 'none',
      settings: 'none',
    },
  },
  {
    key: 'sales',
    name: 'Sales',
    pluralName: 'sales staff',
    description: 'Leads, buyers, units and subscriptions.',
    requiresTwoStep: false,
    levels: {
      land: 'view',
      projects: 'view',
      sales: 'edit',
      finance: 'none',
      facility: 'none',
      hr: 'none',
      compliance: 'edit',
      documents: 'edit',
      analytics: 'none',
      settings: 'none',
    },
  },
  {
    key: 'finance',
    name: 'Finance',
    pluralName: 'finance staff',
    description: 'Books, receipts, tax and payroll approval.',
    requiresTwoStep: true,
    levels: {
      land: 'view',
      projects: 'view',
      sales: 'viewApprove',
      finance: 'full',
      facility: 'view',
      hr: 'viewApprove',
      compliance: 'view',
      documents: 'view',
      analytics: 'view',
      settings: 'none',
    },
  },
  {
    key: 'hr',
    name: 'HR',
    pluralName: 'HR staff',
    description: 'Staff records and payroll.',
    requiresTwoStep: true,
    levels: {
      land: 'none',
      projects: 'none',
      sales: 'none',
      finance: 'none',
      facility: 'none',
      hr: 'full',
      compliance: 'none',
      documents: 'view',
      analytics: 'none',
      settings: 'none',
    },
  },
  {
    key: 'facility',
    name: 'Facility',
    pluralName: 'facility staff',
    description: 'Estates, residents and maintenance.',
    requiresTwoStep: false,
    levels: {
      land: 'none',
      projects: 'view',
      sales: 'view',
      finance: 'none',
      facility: 'full',
      hr: 'none',
      compliance: 'none',
      documents: 'view',
      analytics: 'none',
      settings: 'none',
    },
  },
  {
    key: 'viewer',
    name: 'Viewer',
    pluralName: 'viewers',
    description: 'Can look at most things and change nothing.',
    requiresTwoStep: false,
    levels: {
      land: 'view',
      projects: 'view',
      sales: 'view',
      finance: 'view',
      facility: 'view',
      hr: 'none',
      compliance: 'view',
      documents: 'view',
      analytics: 'view',
      settings: 'none',
    },
  },
]

/** The role's levels expanded to actions per module. */
export function defaultPermissions(role: DefaultRole): PermissionSet {
  const entries = PERMISSION_MODULES.map((m) => [m, [...PERMISSION_LEVELS[role.levels[m]]]])
  return Object.fromEntries(entries) as PermissionSet
}

export function defaultRole(key: SystemRoleKey): DefaultRole {
  const role = DEFAULT_ROLES.find((r) => r.key === key)
  if (!role) throw new Error(`Unknown system role ${key}`)
  return role
}

/** Whether a built-in role may do an action by default. The permission tests use this as the expected result. */
export function defaultRoleAllows(
  key: SystemRoleKey,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  return (PERMISSION_LEVELS[defaultRole(key).levels[module]] as readonly string[]).includes(action)
}
