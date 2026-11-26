import { type QueryClient, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import type { Me, PermissionSet, Role, SystemRoleKey } from '@vento/shared'
import { meQuery } from '@/features/account/api'
import { orpc } from '@/lib/orpc'
import { can, intersectPermissions } from '@/lib/permissions'
import { getPreview, type PreviewRole, usePreview } from './preview-role'

export type EffectiveAccess = {
  /** What navigation shows: the previewed role's view, never wider than the member's own. */
  permissions: PermissionSet | null
  roleKey: SystemRoleKey | null
  roleName: string | null
  /** The role being previewed, if any. */
  previewing: Role | null
}

export function rolesQuery() {
  return orpc.roles.list.queryOptions({ staleTime: 5 * 60_000 })
}

/** Preview needs Settings view (owners and admins by default; plan question G). */
export function canPreview(me: Me): boolean {
  return me.member !== null && can(me.member.permissions, 'settings', 'view')
}

export function effectiveAccess(
  me: Me,
  roles: readonly Role[] | undefined,
  preview: PreviewRole | null,
): EffectiveAccess {
  const own = me.member
  if (!own) return { permissions: null, roleKey: null, roleName: null, previewing: null }
  const role = preview && canPreview(me) ? roles?.find((r) => r.id === preview.roleId) : undefined
  if (!role) {
    return {
      permissions: own.permissions,
      roleKey: own.role.key,
      roleName: own.role.name,
      previewing: null,
    }
  }
  return {
    // Decision 12: a preview only narrows; never more than the member's own role can view.
    permissions: intersectPermissions(role.permissions, own.permissions),
    roleKey: role.key,
    roleName: role.name,
    previewing: role,
  }
}

/** For route guards, which run outside React. */
export function effectiveAccessFrom(queryClient: QueryClient): EffectiveAccess | null {
  const me = queryClient.getQueryData<Me>(meQuery().queryKey)
  if (!me) return null
  const roles = queryClient.getQueryData(rolesQuery().queryKey)?.items
  return effectiveAccess(me, roles, getPreview(me.organization?.id))
}

/** The signed-in person. The `_app` guard has always loaded it before the shell renders. */
export function useMe(): Me {
  return useSuspenseQuery(meQuery()).data
}

export function useEffectiveAccess(): EffectiveAccess {
  const me = useMe()
  const preview = usePreview(me.organization?.id)
  const roles = useQuery({ ...rolesQuery(), enabled: preview !== null && canPreview(me) })
  return effectiveAccess(me, roles.data?.items, preview)
}
