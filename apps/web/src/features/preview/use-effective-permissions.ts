import { type QueryClient, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import type { FeatureKey, Me, PermissionSet, Role, SystemRoleKey } from '@vento/shared'
import { useEffect } from 'react'
import { meQuery } from '@/features/account/api'
import type { NavAccess } from '@/features/shell/nav'
import { orpc } from '@/lib/orpc'
import { can, intersectPermissions } from '@/lib/permissions'
import { clearPreview, getPreview, type PreviewRole, usePreview } from './preview-role'

export type EffectiveAccess = NavAccess & {
  /** What navigation shows: the previewed role's view, never wider than the member's own. */
  permissions: PermissionSet | null
  roleKey: SystemRoleKey | null
  roleName: string | null
  /** The role being previewed, if any. */
  previewing: Role | null
  /**
   * Owner-only "Available on Growth" rows (⌘K, limit messages). Follows the previewed role, so
   * an owner previewing Sales sees none, as a Sales member would.
   */
  showUpgradeHints: boolean
}

type Features = NavAccess['features']
const NO_FEATURES: Features = new Map()
// One Map per `me` response, so renders don't rebuild it.
const featureMaps = new WeakMap<Me['features'], Features>()

/** The organization's available features, keyed for lookups. The same while previewing. */
export function featuresOf(me: Me): Features {
  let map = featureMaps.get(me.features)
  if (!map) {
    map = new Map<FeatureKey, { earlyAccess: boolean }>(
      me.features.map((f) => [f.key, { earlyAccess: f.earlyAccess }]),
    )
    featureMaps.set(me.features, map)
  }
  return map
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
  const organization = {
    features: own ? featuresOf(me) : NO_FEATURES,
    internal: me.organization?.internal ?? false,
    allEntities: own !== null && own.entityIds === null,
  }
  if (!own) {
    return {
      ...organization,
      permissions: null,
      roleKey: null,
      roleName: null,
      previewing: null,
      showUpgradeHints: false,
    }
  }
  const role = preview && canPreview(me) ? roles?.find((r) => r.id === preview.roleId) : undefined
  const roleKey = role ? role.key : own.role.key
  return {
    ...organization,
    // A preview narrows Approvals too: shown only if the previewed role approves somewhere.
    approvals: me.canSeeApprovals && (!role || approvesSomewhere(role.permissions)),
    // Decision 12: a preview only narrows; never more than the member's own role can view.
    permissions: role ? intersectPermissions(role.permissions, own.permissions) : own.permissions,
    roleKey,
    roleName: role ? role.name : own.role.name,
    previewing: role ?? null,
    // The server sends `plan` to owners only; the role check covers a preview.
    showUpgradeHints: me.plan !== null && roleKey === 'owner',
  }
}

function approvesSomewhere(permissions: PermissionSet): boolean {
  return Object.values(permissions).some((actions) => actions.includes('approve'))
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
  // A previewed custom role that was deleted ends the preview (the banner would name nothing).
  const vanished =
    preview !== null && roles.isSuccess && !roles.data.items.some((r) => r.id === preview.roleId)
  useEffect(() => {
    if (vanished) clearPreview()
  }, [vanished])
  return effectiveAccess(me, roles.data?.items, preview)
}
