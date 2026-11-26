import type { Me, PermissionAction, PermissionSet } from '@vento/shared'
import { can } from '@/lib/permissions'

export type OrgWideRefusal = 'permission' | 'all_entities'

/**
 * May the viewer make an organization-wide change (the profile, adding, archiving or restoring
 * companies, roles)? The server decides; this mirrors it so the screen never offers what it
 * would refuse. Follows the previewed role, so an admin previewing a viewer sees read-only.
 */
export function orgWideRefusal(
  me: Me,
  permissions: PermissionSet | null,
  action: PermissionAction,
): OrgWideRefusal | null {
  if (!can(permissions, 'settings', action)) return 'permission'
  if (me.member?.entityIds != null) return 'all_entities'
  return null
}

/** The line above a read-only page, as the server words the same refusal. */
export function orgWideRefusalText(refusal: OrgWideRefusal, ask: string | null): string {
  const lead =
    refusal === 'all_entities'
      ? 'Only people with access to every company can change this.'
      : 'Only owners and admins can change this.'
  return `${lead} ${ask ? `Ask ${ask}.` : 'Ask an owner.'}`
}
