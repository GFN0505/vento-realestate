import { z } from 'zod'
import { nextStep } from '../account/schema'
import { newPassword, termsVersion } from '../auth/password-schema'
import { id, isoDate } from '../common/schemas'
import { HIDDEN_CHARACTERS_MESSAGE, hasHiddenCharacters } from '../common/text'
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
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

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

/** An entity named in someone's access. */
export const entityRef = z.object({ id, name: z.string() })
export type EntityRef = z.infer<typeof entityRef>

export const memberStatus = z.enum(['active', 'removed'])
export type MemberStatus = z.infer<typeof memberStatus>

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

export const whoCanChangeAccessInput = z.strictObject({ module: permissionModule })

/**
 * For the 403 page: "HR & payroll is for owners, admins, HR staff and finance staff. Ask Olumide
 * Bankole (owner) to change your access." Names only, never emails.
 */
export const whoCanChangeAccessOutput = z.object({
  /** Plural names of the roles that can view the module, built-in roles in system order first. */
  roles: z.array(z.string()),
  /** Up to two people who can change access (Settings edit), owners first, never the caller. */
  contacts: z.array(z.object({ name: z.string(), roleName: z.string() })).max(2),
})
export type WhoCanChangeAccess = z.infer<typeof whoCanChangeAccessOutput>
