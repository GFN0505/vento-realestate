import { MODULE_LABELS, type Role } from '@vento/shared'

/** "Can approve: Sales & CRM, Finance, HR & payroll", or null for a role that approves nothing. */
export function approveNote(role: Pick<Role, 'canApprove'>): string | null {
  if (role.canApprove.length === 0) return null
  return `Can approve: ${role.canApprove.map((m) => MODULE_LABELS[m]).join(', ')}`
}

/**
 * The two-step line under a role that requires it. New people set it up when they join; members
 * whose two-step is off do so at their next sign-in.
 */
export function twoStepNote(role: Pick<Role, 'name' | 'requiresTwoStep'>, joining: boolean) {
  if (!role.requiresTwoStep) return null
  return joining
    ? `${role.name} needs two-step sign-in. They'll set it up when they join.`
    : `${role.name} needs two-step sign-in. They'll set it up at their next sign-in if it's off.`
}

/**
 * The roles a viewer may give, in the server's order (built-ins, then custom A–Z). Roles wider
 * than the viewer's own permissions are left out, like Owner for non-owners (plan question 2):
 * nobody is offered something they can't do.
 */
export function grantableRoles<T extends Pick<Role, 'key' | 'can'>>(
  roles: readonly T[],
  viewerIsOwner: boolean,
) {
  return roles.filter((role) => role.can.assign && (viewerIsOwner || role.key !== 'owner'))
}

/** Built-in roles (in the server's order), then custom ones (A–Z): how every role list groups. */
export function splitRoles<T extends Pick<Role, 'isSystem'>>(roles: readonly T[]) {
  return { builtIn: roles.filter((r) => r.isSystem), custom: roles.filter((r) => !r.isSystem) }
}
