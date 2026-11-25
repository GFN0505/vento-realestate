import { approvableModules, type Role, SYSTEM_ROLE_KEYS, type SystemRoleKey } from '@vento/shared'
import { eq, inArray } from 'drizzle-orm'
import { type ServiceContext, toPermissionSet } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { rolePermissions, roles } from '@/db/schema'

const rank = (key: string | null) => {
  const i = SYSTEM_ROLE_KEYS.indexOf(key as SystemRoleKey)
  return i === -1 ? SYSTEM_ROLE_KEYS.length : i
}

/** Roles with their permissions, in two queries. */
export async function loadRoles(
  db: DbOrTx,
  organizationId: string,
  roleIds?: string[],
): Promise<Role[]> {
  const rows = await db
    .select()
    .from(roles)
    .where(roleIds ? inArray(roles.id, roleIds) : eq(roles.organizationId, organizationId))
  const scoped = rows.filter((r) => r.organizationId === organizationId)
  if (scoped.length === 0) return []
  const perms = await db
    .select({
      roleId: rolePermissions.roleId,
      module: rolePermissions.module,
      action: rolePermissions.action,
    })
    .from(rolePermissions)
    .where(
      inArray(
        rolePermissions.roleId,
        scoped.map((r) => r.id),
      ),
    )
  return scoped
    .sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name))
    .map((r) => {
      const permissions = toPermissionSet(
        perms.filter((p) => p.roleId === r.id).map((p) => `${p.module}.${p.action}`),
      )
      return {
        id: r.id,
        key: r.key as SystemRoleKey | null,
        name: r.name,
        pluralName: r.pluralName,
        description: r.description,
        isSystem: r.isSystem,
        requiresTwoStep: r.requiresTwoStep,
        permissions,
        canApprove: approvableModules(permissions),
      }
    })
}

export async function listRoles(ctx: ServiceContext) {
  const items = await loadRoles(ctx.db, ctx.organizationId)
  return { items, page: 1, pageSize: Math.max(items.length, 1), total: items.length }
}
