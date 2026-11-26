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

/** Owners appear in role menus for owners only (spec: nobody is made an owner by accident). */
export function grantableRoles<T extends Pick<Role, 'key'>>(
  roles: readonly T[],
  viewerIsOwner: boolean,
) {
  return roles.filter((role) => viewerIsOwner || role.key !== 'owner')
}
