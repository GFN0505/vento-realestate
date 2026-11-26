import { z } from 'zod'
import { entityRef } from '../access/schema'
import { roleRef } from '../account/schema'
import { id, paginated, paginationInput } from '../common/schemas'

const datetime = z.iso.datetime()

/** The Team page's chips: everyone (members and open invitations), invited only, removed. */
export const teamShow = z.enum(['everyone', 'invited', 'removed'])
export type TeamShow = z.infer<typeof teamShow>

export const listTeamInput = paginationInput
  .extend({
    /** Name or email, matched anywhere. */
    q: z.string().trim().max(100).optional(),
    /** A role from another organization simply matches nobody (it's a filter, not a lookup). */
    roleId: id.optional(),
    show: teamShow.default('everyone'),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
export type ListTeamInput = z.input<typeof listTeamInput>

/**
 * Which entities a person or invitation can see, as far as the viewer may know: a viewer limited
 * to some entities gets only the names inside their own limit, plus how many others there are
 * ("and 1 other").
 */
export const entityAccess = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({
    kind: z.literal('some'),
    entities: z.array(entityRef),
    hiddenCount: z.number().int().min(0),
  }),
])
export type EntityAccess = z.infer<typeof entityAccess>

/**
 * Derived from the person, not stored: `on` · `reset_pending` (an owner or admin reset it and
 * they haven't set a new password yet) · `setup_required` (the role needs it, or after a reset)
 * · `off`. The same in every organization the person belongs to.
 */
export const twoStepState = z.enum(['on', 'off', 'setup_required', 'reset_pending'])
export type TwoStepState = z.infer<typeof twoStepState>

/**
 * Whether the invitation email arrived, separate from its status. `queued` and `sent` show no
 * badge; `failed`, `bounced` and `complained` show "Email not delivered". A `queued` row older
 * than 10 minutes is reported as `failed` (the send never happened).
 */
export const invitationDelivery = z.enum(['queued', 'sent', 'failed', 'bounced', 'complained'])
export type InvitationDelivery = z.infer<typeof invitationDelivery>

/** Why a row has no actions for this viewer, with the one line the sheet shows. */
export const readOnlyReason = z.enum(['self', 'owner', 'wider_access'])
export type ReadOnlyReason = z.infer<typeof readOnlyReason>
export const readOnly = z.object({ reason: readOnlyReason, message: z.string() }).nullable()
export type ReadOnly = z.infer<typeof readOnly>

export const teamMemberRow = z.object({
  kind: z.literal('member'),
  id,
  userId: id,
  name: z.string(),
  email: z.string(),
  isYou: z.boolean(),
  role: roleRef,
  access: entityAccess,
  twoStep: twoStepState,
  joinedAt: datetime,
  /** Updated at most hourly; shown by day. */
  lastActiveAt: datetime.nullable(),
  /** Computed on the server from the viewer's permissions and the manage rules. */
  can: z.object({
    changeAccess: z.boolean(),
    /** Only when two-step is on. */
    resetTwoStep: z.boolean(),
    remove: z.boolean(),
  }),
  readOnly,
})
export type TeamMemberRow = z.infer<typeof teamMemberRow>

export const teamInvitationRow = z.object({
  kind: z.literal('invitation'),
  id,
  email: z.string(),
  role: roleRef,
  access: entityAccess,
  /** `expired`: still open, past its expiry; Resend brings it back. */
  status: z.enum(['pending', 'expired']),
  invitedByName: z.string(),
  lastSentAt: datetime,
  expiresAt: datetime,
  delivery: invitationDelivery,
  deliveryChangedAt: datetime.nullable(),
  can: z.object({ resend: z.boolean(), withdraw: z.boolean() }),
  readOnly,
})
export type TeamInvitationRow = z.infer<typeof teamInvitationRow>

export const teamRemovedRow = z.object({
  kind: z.literal('removed'),
  /** The removed membership. */
  id,
  userId: id,
  name: z.string(),
  email: z.string(),
  /** The role they had, for "Invite again". */
  role: roleRef,
  removedAt: datetime,
  /** null for removals recorded before this was kept. */
  removedByName: z.string().nullable(),
})
export type TeamRemovedRow = z.infer<typeof teamRemovedRow>

export const teamRow = z.discriminatedUnion('kind', [
  teamMemberRow,
  teamInvitationRow,
  teamRemovedRow,
])
export type TeamRow = z.infer<typeof teamRow>

export const listTeamOutput = paginated(teamRow).extend({
  /** Organization-wide, whatever the filters: for the context line and the chips. */
  counts: z.object({
    members: z.number().int().min(0),
    /** Open invitations, expired ones included (they're listed until resent or withdrawn). */
    invited: z.number().int().min(0),
    removed: z.number().int().min(0),
  }),
})
export type ListTeamOutput = z.infer<typeof listTeamOutput>

/** Setup checklist items, in display order. Later bricks append theirs. */
export const checklistItemKey = z.enum(['organization', 'first_entity', 'two_step', 'invite_team'])
export type ChecklistItemKey = z.infer<typeof checklistItemKey>

export const checklistItem = z.object({
  key: checklistItemKey,
  done: z.boolean(),
  /** What made it done: "Vento Homes Ltd", "On for you", "3 people invited"… null while open. */
  detail: z.string().nullable(),
})
export type ChecklistItem = z.infer<typeof checklistItem>

export const checklist = z.object({
  /** Draw the card on Home: not hidden, and not all done since before today (Lagos). */
  shown: z.boolean(),
  /** Hidden by this person; ⌘K "Show setup checklist" is offered. */
  hidden: z.boolean(),
  items: z.array(checklistItem),
  allDone: z.boolean(),
})
export type Checklist = z.infer<typeof checklist>
