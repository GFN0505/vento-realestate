import {
  hasPermission,
  type PermissionSet,
  type RoleReadOnlyReason,
  type SystemRoleKey,
} from '@vento/shared'
import { askOwner, GRANT_CEILING_MESSAGE, type ManageViewer, widerThan } from './manage-rules'

// Who may make, edit, delete, duplicate and give which role. The roles service throws these
// refusals and roles.list uses the same functions for each role's flags, so the page and the
// server can't drift. Pure: holder counts come in with the role.

export type RoleSubject = {
  id: string
  key: SystemRoleKey | null
  name: string
  permissions: PermissionSet
}

export type RoleAction = 'edit' | 'delete' | 'duplicate'

export type RoleRefusal = {
  reason:
    | 'permission'
    | 'all_entities_required'
    | 'built_in_role'
    | 'own_role'
    | 'wider_permissions'
  message: string
}

export type RoleAsk = {
  ownerName: string | null
  /** "Only owners and admins can change roles. Ask …": needed only when the viewer lacks the permission. */
  permissionMessage: string
}

/** "Only people with access to every company can change this. Ask Olumide Bankole (owner)." */
export function allEntitiesMessage(ownerName: string | null): string {
  const ask = ownerName ? ` Ask ${ownerName} (owner).` : ' Ask an owner.'
  return `Only people with access to every company can change this.${ask}`
}

const SETTINGS_ACTION = { edit: 'edit', delete: 'delete', duplicate: 'create' } as const

export const BUILT_IN_MESSAGE = "Built-in roles can't be changed. Duplicate it to make your own."
export const OWN_ROLE_MESSAGE = 'You have this role. Ask another owner or admin to change it.'

/**
 * Why the viewer may not do `action` with this role, or null. First match wins, in the plan's
 * order: permission, all companies, built-in, own role, the role wider than the viewer (edit),
 * or the source wider than the viewer (duplicate). Holders (delete) and the new permissions
 * (save) are checked by the service.
 */
export function roleRefusal(
  viewer: ManageViewer,
  role: RoleSubject,
  action: RoleAction,
  ask: RoleAsk,
): RoleRefusal | null {
  if (!hasPermission(viewer.permissions, 'settings', SETTINGS_ACTION[action])) {
    return { reason: 'permission', message: ask.permissionMessage }
  }
  if (viewer.entityIds !== null) {
    return { reason: 'all_entities_required', message: allEntitiesMessage(ask.ownerName) }
  }
  if (action === 'duplicate') {
    return widerThan(viewer, role.permissions)
      ? { reason: 'wider_permissions', message: GRANT_CEILING_MESSAGE }
      : null
  }
  if (role.key !== null) return { reason: 'built_in_role', message: BUILT_IN_MESSAGE }
  if (role.id === viewer.roleId) return { reason: 'own_role', message: OWN_ROLE_MESSAGE }
  if (action === 'edit' && widerThan(viewer, role.permissions)) {
    return {
      reason: 'wider_permissions',
      message: `${role.name} can do things you can't. ${askOwner(ask.ownerName)}`,
    }
  }
  return null
}

/** Whether a refusal for this role needs "Ask … (owner)", so callers look the name up only then. */
export function roleNeedsOwnerName(viewer: ManageViewer, role: RoleSubject): boolean {
  return viewer.entityIds !== null || (role.key === null && widerThan(viewer, role.permissions))
}

/** Whether the viewer may give this role on Team or in an invite (owner rule and ceiling). */
export function mayAssign(viewer: ManageViewer, role: Pick<RoleSubject, 'key' | 'permissions'>) {
  if (role.key === 'owner' && viewer.roleKey !== 'owner') return false
  return !widerThan(viewer, role.permissions)
}

const READ_ONLY: Record<RoleRefusal['reason'], RoleReadOnlyReason> = {
  permission: 'permission',
  all_entities_required: 'all_entities',
  built_in_role: 'built_in',
  own_role: 'own_role',
  wider_permissions: 'wider_permissions',
}

/** The role's flags and read-only line for roles.list and roles.get. */
export function roleRights(
  viewer: ManageViewer,
  role: RoleSubject & { memberCount: number; invitedCount: number },
  ask: RoleAsk,
): {
  can: { assign: boolean; edit: boolean; delete: boolean; duplicate: boolean }
  readOnly: { reason: RoleReadOnlyReason; message: string } | null
} {
  const edit = roleRefusal(viewer, role, 'edit', ask)
  const held = role.memberCount + role.invitedCount > 0
  const reason = edit ? READ_ONLY[edit.reason] : null
  return {
    can: {
      assign: mayAssign(viewer, role),
      edit: edit === null,
      delete: !held && roleRefusal(viewer, role, 'delete', ask) === null,
      duplicate: roleRefusal(viewer, role, 'duplicate', ask) === null,
    },
    // The page speaks about the built-in role it shows; the server refusal is shorter.
    readOnly:
      edit && reason
        ? {
            reason,
            message:
              reason === 'built_in'
                ? "Built-in roles can't be changed. Duplicate this role to make your own version."
                : edit.message,
          }
        : null,
  }
}
