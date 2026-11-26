import {
  hasPermission,
  type PermissionSet,
  type ReadOnly,
  type ReadOnlyReason,
  type TwoStepState,
} from '@vento/shared'
import type { ServiceContext } from './context'

// The one source of "who may manage whom" on Team. The members and invitations services throw
// these refusals; team.list uses the same functions for its per-row flags, so the screen and the
// server can't drift. Pure: the last-owner rule needs a count and stays in the members service.

export type ManageViewer = {
  userId: string
  roleKey: string | null
  permissions: PermissionSet
  /** null = all entities. */
  entityIds: readonly string[] | null
}

/** The signed-in member, as the rules see them. */
export function viewerOf(ctx: Pick<ServiceContext, 'user' | 'member'>): ManageViewer {
  return {
    userId: ctx.user.id,
    roleKey: ctx.member.roleKey,
    permissions: ctx.member.permissions,
    entityIds: ctx.member.entityIds,
  }
}

export type MemberTarget = {
  userId: string
  name: string
  roleKey: string | null
  entityIds: readonly string[] | null
}

export type InvitationTarget = {
  email: string
  roleKey: string | null
  entityIds: readonly string[] | null
}

export type MemberAction = 'change' | 'reset' | 'remove'
export type InvitationAction = 'resend' | 'withdraw'

export type Refusal = {
  reason: 'own_access' | 'owner_only' | 'entity_limit'
  message: string
}

const isOwner = (roleKey: string | null) => roleKey === 'owner'

/**
 * True when everything the target can see lies inside the granter's own limit. A granter with
 * all entities can manage anyone; a limited one can't manage "all" or anything outside theirs.
 */
export function withinGranterAccess(
  granter: readonly string[] | null,
  target: readonly string[] | null,
): boolean {
  if (granter === null) return true
  if (target === null) return false
  return target.every((id) => granter.includes(id))
}

const askOwner = (ownerName: string | null) =>
  ownerName ? `Ask ${ownerName} (owner) to change it.` : 'Ask an owner to change it.'

const SELF_MESSAGES: Record<MemberAction, string> = {
  change: "You can't change your own access. Ask another owner or admin.",
  reset: "You can't reset your own two-step. Ask another owner or admin.",
  remove: "You can't change your own access. Ask another owner or admin.",
}

const OWNER_MESSAGES: Record<MemberAction, string> = {
  change: "Only owners can change an owner's access.",
  reset: "Only owners can reset an owner's two-step.",
  remove: 'Only owners can remove an owner.',
}

/**
 * Why the viewer may not do `action` to this member, or null. First match wins: self, owner
 * rules, wider access. `newRoleKey` is the role being given (change only).
 */
export function memberRefusal(
  viewer: ManageViewer,
  target: MemberTarget,
  action: MemberAction,
  options: { newRoleKey?: string | null; ownerName: string | null },
): Refusal | null {
  if (target.userId === viewer.userId) {
    return { reason: 'own_access', message: SELF_MESSAGES[action] }
  }
  if (!isOwner(viewer.roleKey)) {
    if (isOwner(target.roleKey)) return { reason: 'owner_only', message: OWNER_MESSAGES[action] }
    if (action === 'change' && isOwner(options.newRoleKey ?? null)) {
      return { reason: 'owner_only', message: 'Only owners can make someone an owner.' }
    }
  }
  if (!withinGranterAccess(viewer.entityIds, target.entityIds)) {
    return {
      reason: 'entity_limit',
      message: `${target.name} has access to entities you can't see. ${askOwner(options.ownerName)}`,
    }
  }
  return null
}

/** Why the viewer may not resend or withdraw this invitation, or null. */
export function invitationRefusal(
  viewer: ManageViewer,
  target: InvitationTarget,
  action: InvitationAction,
  options: { ownerName: string | null },
): Refusal | null {
  // Resending re-issues an owner grant, so it's for owners; withdrawing only takes one back.
  if (action === 'resend' && isOwner(target.roleKey) && !isOwner(viewer.roleKey)) {
    return { reason: 'owner_only', message: 'Only owners can resend an owner invitation.' }
  }
  if (!withinGranterAccess(viewer.entityIds, target.entityIds)) {
    return {
      reason: 'entity_limit',
      message: `The invitation to ${target.email} includes entities you can't see. ${askOwner(options.ownerName)}`,
    }
  }
  return null
}

/** Whether a refusal message needs "Ask … (owner)", so callers look the name up only then. */
export function needsOwnerName(
  viewer: Pick<ManageViewer, 'entityIds'>,
  target: Pick<MemberTarget, 'entityIds'>,
): boolean {
  return !withinGranterAccess(viewer.entityIds, target.entityIds)
}

const READ_ONLY_REASON: Record<Refusal['reason'], ReadOnlyReason> = {
  own_access: 'self',
  owner_only: 'owner',
  entity_limit: 'wider_access',
}

function readOnlyFrom(refusal: Refusal | null): ReadOnly {
  if (!refusal) return null
  const reason = READ_ONLY_REASON[refusal.reason]
  // The sheet speaks to the viewer about their own row; the server refusal is more general.
  const message =
    reason === 'self'
      ? 'This is you. Ask another owner or admin to change your access.'
      : refusal.message
  return { reason, message }
}

/** The member row's flags and read-only line for team.list. */
export function memberRowRights(
  viewer: ManageViewer,
  target: MemberTarget & { twoStep: TwoStepState },
  ownerName: string | null,
): {
  can: { changeAccess: boolean; resetTwoStep: boolean; remove: boolean }
  readOnly: ReadOnly
} {
  const allowed = (action: MemberAction) =>
    memberRefusal(viewer, target, action, { ownerName }) === null
  const p = viewer.permissions
  return {
    can: {
      changeAccess: hasPermission(p, 'settings', 'edit') && allowed('change'),
      resetTwoStep:
        target.twoStep === 'on' && hasPermission(p, 'settings', 'edit') && allowed('reset'),
      remove: hasPermission(p, 'settings', 'delete') && allowed('remove'),
    },
    readOnly: readOnlyFrom(memberRefusal(viewer, target, 'change', { ownerName })),
  }
}

/** The invitation row's flags and read-only line for team.list. */
export function invitationRowRights(
  viewer: ManageViewer,
  target: InvitationTarget,
  ownerName: string | null,
): { can: { resend: boolean; withdraw: boolean }; readOnly: ReadOnly } {
  const allowed = (action: InvitationAction) =>
    invitationRefusal(viewer, target, action, { ownerName }) === null
  const p = viewer.permissions
  const wider = !withinGranterAccess(viewer.entityIds, target.entityIds)
  return {
    can: {
      resend: hasPermission(p, 'settings', 'create') && allowed('resend'),
      withdraw: hasPermission(p, 'settings', 'delete') && allowed('withdraw'),
    },
    // Only wider access makes the whole row read-only; an admin can still withdraw an owner invitation.
    readOnly: wider
      ? readOnlyFrom(invitationRefusal(viewer, target, 'withdraw', { ownerName }))
      : null,
  }
}
