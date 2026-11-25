import { z } from 'zod'

/** Modules a permission applies to. Removing a value later needs a planned migration. */
export const PERMISSION_MODULES = [
  'land',
  'projects',
  'sales',
  'finance',
  'facility',
  'hr',
  'compliance',
  'documents',
  'analytics',
  'settings',
] as const
export const permissionModule = z.enum(PERMISSION_MODULES)
export type PermissionModule = z.infer<typeof permissionModule>

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const
export const permissionAction = z.enum(PERMISSION_ACTIONS)
export type PermissionAction = z.infer<typeof permissionAction>

export const MODULE_LABELS: Record<PermissionModule, string> = {
  land: 'Land & title',
  projects: 'Projects & construction',
  sales: 'Sales & CRM',
  finance: 'Finance',
  facility: 'Facility & estate',
  hr: 'HR & payroll',
  compliance: 'Compliance',
  documents: 'Documents & contracts',
  analytics: 'Executive analytics',
  settings: 'Settings',
}

/** Levels used in the role table. "+ approve" is `view` plus `approve`. */
export const PERMISSION_LEVELS = {
  full: ['view', 'create', 'edit', 'delete', 'export', 'approve'],
  edit: ['view', 'create', 'edit', 'export'],
  view: ['view'],
  viewApprove: ['view', 'approve'],
  none: [],
} as const satisfies Record<string, readonly PermissionAction[]>
export type PermissionLevel = keyof typeof PERMISSION_LEVELS

/** Every module with the actions allowed in it (empty array = no access). */
export const permissionSet = z.record(permissionModule, z.array(permissionAction))
export type PermissionSet = z.infer<typeof permissionSet>

export function hasPermission(
  permissions: PermissionSet,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  return permissions[module].includes(action)
}

/** Modules a role can approve in, e.g. for "Can approve: Sales & CRM, Finance". */
export function approvableModules(permissions: PermissionSet): PermissionModule[] {
  return PERMISSION_MODULES.filter((m) => permissions[m].includes('approve'))
}

/** An empty set: every module, no actions. */
export function emptyPermissionSet(): PermissionSet {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m, []])) as unknown as PermissionSet
}
