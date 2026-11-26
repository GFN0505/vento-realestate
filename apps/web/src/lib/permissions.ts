import type { PermissionAction, PermissionModule, PermissionSet } from '@vento/shared'

/*
 * The shell's permission checks, on plain data. Shared's `hasPermission` lives beside zod enums
 * whose module-level calls would pull zod (about 25 KB gzip) into the first load; the rule
 * itself is one line, the types still come from shared.
 */

export function can(
  permissions: PermissionSet | null,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  return permissions?.[module]?.includes(action) ?? false
}

/** Actions allowed in both sets, module by module. */
export function intersectPermissions(a: PermissionSet, b: PermissionSet): PermissionSet {
  const modules = Object.keys(a) as PermissionModule[]
  return Object.fromEntries(
    modules.map((m) => [m, a[m].filter((action) => b[m]?.includes(action))]),
  ) as PermissionSet
}
