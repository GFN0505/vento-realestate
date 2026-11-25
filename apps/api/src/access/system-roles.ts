import { DEFAULT_ROLES, defaultPermissions, PERMISSION_MODULES } from '@vento/shared'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { rolePermissions, roles } from '@/db/schema'

/**
 * Creates or refreshes the nine built-in roles for an organization from the shared default
 * table. Idempotent. Run inside the caller's transaction.
 */
export async function syncSystemRoles(
  tx: DbOrTx,
  organizationId: string,
): Promise<Map<string, string>> {
  const rows = await tx
    .insert(roles)
    .values(
      DEFAULT_ROLES.map((r) => ({
        organizationId,
        key: r.key,
        name: r.name,
        pluralName: r.pluralName,
        description: r.description,
        isSystem: true,
        requiresTwoStep: r.requiresTwoStep,
      })),
    )
    .onConflictDoUpdate({
      target: [roles.organizationId, roles.key],
      targetWhere: sql`${roles.key} is not null`,
      set: {
        name: sql`excluded.name`,
        pluralName: sql`excluded.plural_name`,
        description: sql`excluded.description`,
        isSystem: sql`true`,
        requiresTwoStep: sql`excluded.requires_two_step`,
      },
    })
    .returning({ id: roles.id, key: roles.key })

  const idByKey = new Map(rows.flatMap((r) => (r.key ? [[r.key, r.id] as const] : [])))
  const roleIds = [...idByKey.values()]
  await tx
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.organizationId, organizationId),
        inArray(rolePermissions.roleId, roleIds),
      ),
    )
  const permissionRows = DEFAULT_ROLES.flatMap((role) => {
    const roleId = idByKey.get(role.key)
    const permissions = defaultPermissions(role)
    return roleId
      ? PERMISSION_MODULES.flatMap((module) =>
          permissions[module].map((action) => ({ organizationId, roleId, module, action })),
        )
      : []
  })
  if (permissionRows.length) await tx.insert(rolePermissions).values(permissionRows)
  return idByKey
}

export async function systemRoleId(
  tx: DbOrTx,
  organizationId: string,
  key: string,
): Promise<string> {
  const [row] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.key, key), isNotNull(roles.key)))
  if (!row) throw new Error(`System role ${key} missing for organization`)
  return row.id
}
