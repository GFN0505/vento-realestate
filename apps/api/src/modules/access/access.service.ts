import type { PermissionModule, WhoCanChangeAccess } from '@vento/shared'
import { and, asc, eq, exists, ne, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import { systemRoleOrder } from '@/access/who-can-grant'
import { members, rolePermissions, roles, users } from '@/db/schema'

const MAX_CONTACTS = 2

/** Roles in this organization that can view the module, as plural names in system order. */
async function rolesThatCanView(ctx: ServiceContext, module: PermissionModule): Promise<string[]> {
  const rows = await ctx.db
    .select({ key: roles.key, pluralName: roles.pluralName })
    .from(roles)
    .innerJoin(
      rolePermissions,
      and(
        eq(rolePermissions.roleId, roles.id),
        eq(rolePermissions.organizationId, roles.organizationId),
      ),
    )
    .where(
      and(
        eq(roles.organizationId, ctx.organizationId),
        eq(rolePermissions.module, module),
        eq(rolePermissions.action, 'view'),
      ),
    )
  return rows
    .sort(
      (a, b) =>
        systemRoleOrder(a.key) - systemRoleOrder(b.key) || a.pluralName.localeCompare(b.pluralName),
    )
    .map((r) => r.pluralName)
}

/**
 * People who can change someone's access (Settings edit, what members.updateAccess needs),
 * owners first, then longest-standing. Never the caller, never an email.
 */
async function accessContacts(ctx: ServiceContext): Promise<WhoCanChangeAccess['contacts']> {
  const canEditSettings = ctx.db
    .select({ one: sql`1` })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, members.roleId),
        eq(rolePermissions.module, 'settings'),
        eq(rolePermissions.action, 'edit'),
      ),
    )
  return ctx.db
    .select({ name: users.name, roleName: roles.name })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, ctx.organizationId),
        eq(members.status, 'active'),
        ne(members.userId, ctx.user.id),
        exists(canEditSettings),
      ),
    )
    .orderBy(sql`(${roles.key} = 'owner') is true desc`, asc(members.joinedAt), asc(members.id))
    .limit(MAX_CONTACTS)
}

/** What the 403 page needs to say who can open a module and who to ask. */
export async function whoCanChangeAccess(
  ctx: ServiceContext,
  module: PermissionModule,
): Promise<WhoCanChangeAccess> {
  const [roleNames, contacts] = await Promise.all([
    rolesThatCanView(ctx, module),
    accessContacts(ctx),
  ])
  return { roles: roleNames, contacts }
}
