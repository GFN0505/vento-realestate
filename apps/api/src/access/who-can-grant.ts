import { type PermissionAction, type PermissionModule, SYSTEM_ROLE_KEYS } from '@vento/shared'
import { and, eq, inArray, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { members, rolePermissions, roles, users } from '@/db/schema'

/** "owners", "owners and admins", "owners, admins and finance staff". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const order = (key: string | null) => {
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
    .selectDistinct({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      pluralName: roles.pluralName,
    })
    .from(roles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(
      and(
        eq(roles.organizationId, input.organizationId),
        eq(rolePermissions.module, input.module),
        eq(rolePermissions.action, input.action),
      ),
    )
  holders.sort((a, b) => order(a.key) - order(b.key))
  const only = `Only ${joinNames(holders.map((h) => h.pluralName))} can ${input.doing}.`
  if (holders.length === 0) return { message: `You don't have access to ${input.doing}.` }

  const candidates = await db
    .select({ name: users.name, roleId: members.roleId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(members.organizationId, input.organizationId),
        eq(members.status, 'active'),
        ne(members.userId, input.excludeUserId),
        inArray(
          members.roleId,
          holders.map((h) => h.id),
        ),
      ),
    )
    .orderBy(members.joinedAt)
  // Prefer owners: they can grant anything.
  const ranked = candidates
    .map((c) => ({ ...c, role: holders.find((h) => h.id === c.roleId) }))
    .sort((a, b) => order(a.role?.key ?? null) - order(b.role?.key ?? null))
  const person = ranked[0]
  if (!person?.role) return { message: only }
  const askRole = person.role.name.toLowerCase()
  return { message: `${only} Ask ${person.name} (${askRole}).`, askName: person.name, askRole }
}
