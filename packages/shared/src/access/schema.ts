import { z } from 'zod'
import { nextStep, roleRef } from '../account/schema'
import { newPassword, termsVersion } from '../auth/password-schema'
import { id, isoDate, paginationInput } from '../common/schemas'
import { systemRoleKey } from './default-roles'
import { permissionModule, permissionSet } from './permissions'

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address, like aisha@ventohomes.ng' }))

export const personName = z
  .string()
  .trim()
  .min(2, { message: 'Enter your full name' })
  .max(100, { message: 'Use 100 characters or fewer' })

export const role = z.object({
  id,
  key: systemRoleKey.nullable(),
  name: z.string(),
  pluralName: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  requiresTwoStep: z.boolean(),
  permissions: permissionSet,
  canApprove: z.array(permissionModule),
})
export type Role = z.infer<typeof role>

const entityRef = z.object({ id, name: z.string() })

export const memberStatus = z.enum(['active', 'removed'])
export type MemberStatus = z.infer<typeof memberStatus>

export const member = z.object({
  id,
  userId: id,
  name: z.string(),
  email: z.string(),
  role: roleRef,
  /** null = all entities. */
  entities: z.array(entityRef).nullable(),
  twoFactorEnabled: z.boolean(),
  status: memberStatus,
  joinedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
})
export type Member = z.infer<typeof member>

export const listMembersInput = paginationInput.extend({ status: memberStatus.optional() }).strict()

/** Entity limits: null = all entities, otherwise at least one. */
export const entityLimit = z
  .array(id)
  .min(1, { message: 'Choose at least one entity, or allow all' })
  .max(100)
  .nullable()

export const updateMemberAccessInput = z.strictObject({
  memberId: id,
  roleId: id,
  entityIds: entityLimit,
})
export const memberIdInput = z.strictObject({ memberId: id })

export const invitationStatus = z.enum(['pending', 'accepted', 'declined', 'expired', 'withdrawn'])
export type InvitationStatus = z.infer<typeof invitationStatus>

export const invitation = z.object({
  id,
  email: z.string(),
  role: roleRef,
  entities: z.array(entityRef).nullable(),
  /** Effective status: a pending invitation past its expiry reads as `expired`. */
  status: invitationStatus,
  invitedByName: z.string(),
  expiresAt: z.iso.datetime(),
  lastSentAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type Invitation = z.infer<typeof invitation>

export const listInvitationsInput = paginationInput
  .extend({ status: invitationStatus.optional() })
  .strict()

export const MAX_INVITATIONS_PER_BATCH = 20

export const createInvitationsInput = z.strictObject({
  items: z
    .array(z.strictObject({ email, roleId: id }))
    .min(1, { message: 'Add at least one email' })
    .max(MAX_INVITATIONS_PER_BATCH, { message: 'Invite up to 20 people at a time' })
    .refine((items) => new Set(items.map((i) => i.email)).size === items.length, {
      message: 'Each email can only be listed once',
    }),
  entityIds: entityLimit,
})

export const invitationToken = z.string().min(20).max(200)
export const invitationTokenInput = z.strictObject({ token: invitationToken })

export const invitationPreview = z.object({
  status: invitationStatus,
  email: z.string(),
  organizationName: z.string(),
  inviterName: z.string(),
  roleName: z.string(),
  /** Entity names, or 'all'. */
  entities: z.union([z.array(z.string()), z.literal('all')]),
  /** Module labels, e.g. ["Sales & CRM", "Finance", "HR & payroll"]. */
  canApprove: z.array(z.string()),
  twoStepRequired: z.boolean(),
  /** Last day it can be accepted, in Lagos time. */
  expiresOn: isoDate,
  /** An account already uses this email: show "Sign in" instead of name and password. */
  hasAccount: z.boolean(),
})
export type InvitationPreview = z.infer<typeof invitationPreview>

export const acceptInvitationAsNewUserInput = z.strictObject({
  token: invitationToken,
  name: personName,
  password: newPassword,
  /** Must be CURRENT_TERMS_VERSION; recorded with the time, as on sign-up. */
  termsVersion,
})

/**
 * `sign_in`: the account and membership were created but signing in failed (rare); send the
 * person to the sign-in screen.
 */
export const acceptInvitationOutput = z.object({
  nextStep: z.union([nextStep, z.literal('sign_in')]),
})
