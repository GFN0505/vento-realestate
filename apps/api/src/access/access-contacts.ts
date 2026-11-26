import type { PermissionAction, PermissionModule } from '@vento/shared'
import { and, asc, eq, exists, ne, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { members, rolePermissions, roles, users } from '@/db/schema'

export type AccessContact = { name: string; roleName: string }

/**
 * The one "who to ask" ranking: active members of this organization whose role holds
 * `module.action`, owners first (they can grant anything), then longest-standing. Never the
 * caller, never removed members, and only name and role so an email can't leak.
 */
export async function accessContacts(
  db: DbOrTx,
  input: {
    organizationId: string
    module: PermissionModule
    action: PermissionAction
    excludeUserId: string
    limit: number
  },
): Promise<AccessContact[]> {
  const holdsPermission = db
    .select({ one: sql`1` })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, members.roleId),
        eq(rolePermissions.organizationId, members.organizationId),
        eq(rolePermissions.module, input.module),
        eq(rolePermissions.action, input.action),
      ),
    )
  return db
    .select({ name: users.name, roleName: roles.name })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, input.organizationId),
        eq(members.status, 'active'),
        ne(members.userId, input.excludeUserId),
        exists(holdsPermission),
      ),
    )
    .orderBy(sql`(${roles.key} = 'owner') is true desc`, asc(members.joinedAt), asc(members.id))
    .limit(input.limit)
}
