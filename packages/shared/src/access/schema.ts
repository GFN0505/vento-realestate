import { z } from 'zod'
import { nextStep } from '../account/schema'
import { newPassword, termsVersion } from '../auth/password-schema'
import { id, isoDate, paginated } from '../common/schemas'
import { HIDDEN_CHARACTERS_MESSAGE, hasHiddenCharacters } from '../common/text'
import { systemRoleKey } from './default-roles'
import { permissionModule, permissionSet } from './permissions'
import { isEmptyPermissionSet, ROLE_NAME_MAX } from './role-rules'

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

export const roleName = z
  .string()
  .trim()
  .min(2, { message: 'Enter a name for the role' })
  .max(ROLE_NAME_MAX, { message: `Use ${ROLE_NAME_MAX} characters or fewer` })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

export const roleDescription = z
  .string()
  .trim()
  .max(200, { message: 'Use 200 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

/** Why a role page is read-only for this viewer; `message` is the line shown above the grid. */
export const roleReadOnlyReason = z.enum([
  'built_in',
  'own_role',
  'all_entities',
  'permission',
  'wider_permissions',
])
export type RoleReadOnlyReason = z.infer<typeof roleReadOnlyReason>

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
  /** Bumped on every save; `roles.update` must send the version it loaded. */
  version: z.number().int().min(1),
  /** Active members holding the role. */
  memberCount: z.number().int().min(0),
  /** Open invitations for the role, expired ones included (they can be resent). */
  invitedCount: z.number().int().min(0),
  /** For the viewer, computed by the server from the manage rules (like team.list rows). */
  can: z.object({
    /** Offer it in Team and invite role menus (within the viewer's own permissions). */
    assign: z.boolean(),
    edit: z.boolean(),
    /** Custom, editable, and nobody holds it. */
    delete: z.boolean(),
    /** Offer it as "Start from" in New role. */
    duplicate: z.boolean(),
  }),
  readOnly: z.object({ reason: roleReadOnlyReason, message: z.string() }).nullable(),
})
export type Role = z.infer<typeof role>

/**
 * The organization requires two-step for everyone: every role reads "Required" and the custom
 * role switch is locked on. Roles keep their own `requiresTwoStep` for when it's turned off.
 */
const requiredForEveryone = z.boolean()

export const roleList = paginated(role).extend({ requiredForEveryone })
export type RoleList = z.infer<typeof roleList>

export const roleDetail = role.extend({ requiredForEveryone })
export type RoleDetail = z.infer<typeof roleDetail>

export const createRoleInput = z.strictObject({ name: roleName, sourceRoleId: id })
export type CreateRoleInput = z.input<typeof createRoleInput>

export const updateRoleInput = z.strictObject({
  id,
  /** The version the page loaded; a newer one in the database is `role_changed`. */
  version: z.number().int().min(1),
  name: roleName.optional(),
  description: roleDescription.optional(),
  requiresTwoStep: z.boolean().optional(),
  permissions: permissionSet
    .refine((s) => !isEmptyPermissionSet(s), {
      message: 'Give this role access to at least one area',
    })
    .optional(),
})
export type UpdateRoleInput = z.input<typeof updateRoleInput>

/** An entity (a company on screen) named in someone's access. */
export const entityRef = z.object({ id, name: z.string() })
export type EntityRef = z.infer<typeof entityRef>

export const memberStatus = z.enum(['active', 'removed'])
export type MemberStatus = z.infer<typeof memberStatus>

/** Entity limits: null = all entities, otherwise at least one. */
export const entityLimit = z
  .array(id)
  .min(1, { message: 'Choose at least one company, or allow all' })
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
  /** The role requires it, or the organization requires two-step for everyone. */
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
