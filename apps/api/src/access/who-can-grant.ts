import {
  joinNames,
  type PermissionAction,
  type PermissionModule,
  SYSTEM_ROLE_KEYS,
} from '@vento/shared'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { members, rolePermissions, roles, users } from '@/db/schema'
import { accessContacts } from './access-contacts'

/** Built-in roles in system order (owner first); custom roles after them. */
export const systemRoleOrder = (key: string | null): number => {
  const i = SYSTEM_ROLE_KEYS.indexOf(key as (typeof SYSTEM_ROLE_KEYS)[number])
  return i === -1 ? SYSTEM_ROLE_KEYS.length : i
}

export type GrantAdvice = { message: string; askName?: string; askRole?: string }

/**
 * Builds "Only owners and admins can invite people. Ask Olumide Bankole (owner)." Runs only on
 * the error path, so its two queries don't cost a normal request anything.
 */
export async function whoCanGrant(
  db: DbOrTx,
  input: {
    organizationId: string
    module: PermissionModule
    action: PermissionAction
    doing: string
    excludeUserId: string
  },
): Promise<GrantAdvice> {
  const holders = await db
    .selectDistinct({ key: roles.key, pluralName: roles.pluralName })
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
        eq(roles.organizationId, input.organizationId),
        eq(rolePermissions.module, input.module),
        eq(rolePermissions.action, input.action),
      ),
    )
  if (holders.length === 0) return { message: `You don't have access to ${input.doing}.` }
  holders.sort((a, b) => systemRoleOrder(a.key) - systemRoleOrder(b.key))
  const only = `Only ${joinNames(holders.map((h) => h.pluralName))} can ${input.doing}.`

  const [person] = await accessContacts(db, {
    organizationId: input.organizationId,
    module: input.module,
    action: input.action,
    excludeUserId: input.excludeUserId,
    limit: 1,
  })
  if (!person) return { message: only }
  const askRole = person.roleName.toLowerCase()
  return { message: `${only} Ask ${person.name} (${askRole}).`, askName: person.name, askRole }
}

/** The longest-standing active owner other than the caller, for "Ask Olumide Bankole (owner)". */
export async function firstOwner(
  db: DbOrTx,
  organizationId: string,
  excludeUserId: string,
): Promise<{ name: string } | null> {
  const [row] = await db
    .select({ name: users.name })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
        ne(members.userId, excludeUserId),
      ),
    )
    .orderBy(asc(members.joinedAt), asc(members.id))
    .limit(1)
  return row ?? null
}
