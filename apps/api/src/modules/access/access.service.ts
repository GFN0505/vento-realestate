import type { PermissionModule, WhoCanChangeAccess } from '@vento/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { accessContacts } from '@/access/access-contacts'
import type { ServiceContext } from '@/access/context'
import { systemRoleOrder } from '@/access/who-can-grant'
import { rolePermissions, roles } from '@/db/schema'

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
        // A deleted custom role kept for history isn't a role anyone can be given.
        isNull(roles.archivedAt),
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
 * People who can change someone's access: holders of Settings edit, which is what
 * members.updateAccess needs.
 */
function changeAccessContacts(ctx: ServiceContext): Promise<WhoCanChangeAccess['contacts']> {
  return accessContacts(ctx.db, {
    organizationId: ctx.organizationId,
    module: 'settings',
    action: 'edit',
    excludeUserId: ctx.user.id,
    limit: MAX_CONTACTS,
  })
}

/** What the 403 page needs to say who can open a module and who to ask. */
export async function whoCanChangeAccess(
  ctx: ServiceContext,
  module: PermissionModule,
): Promise<WhoCanChangeAccess> {
  const [roleNames, contacts] = await Promise.all([
    rolesThatCanView(ctx, module),
    changeAccessContacts(ctx),
  ])
  return { roles: roleNames, contacts }
}
