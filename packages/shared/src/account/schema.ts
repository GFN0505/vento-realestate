import { z } from 'zod'
import { systemRoleKey } from '../access/default-roles'
import { permissionSet } from '../access/permissions'
import { id } from '../common/schemas'

/** Where the web sends a signed-in person next. The server decides; the web only follows. */
export const nextStep = z.enum([
  'onboarding_organization',
  'onboarding_entity',
  'two_step_setup',
  'ready',
])
export type NextStep = z.infer<typeof nextStep>

export const roleRef = z.object({ id, key: systemRoleKey.nullable(), name: z.string() })
export type RoleRef = z.infer<typeof roleRef>

export const me = z.object({
  user: z.object({
    id,
    name: z.string(),
    email: z.string(),
    twoFactorEnabled: z.boolean(),
    /** Typed at sign-up; pre-fills onboarding step 1. */
    companyName: z.string().nullable(),
  }),
  organization: z.object({ id, name: z.string() }).nullable(),
  member: z
    .object({
      id,
      role: roleRef,
      /** null = all entities. */
      entityIds: z.array(id).nullable(),
      permissions: permissionSet,
    })
    .nullable(),
  nextStep,
  /** The role requires two-step, or an owner or admin reset it. */
  twoStepRequired: z.boolean(),
})
export type Me = z.infer<typeof me>

export const sessionItem = z.object({
  id,
  /** "iPhone", "Mac", "Windows PC", "Android phone"… */
  device: z.string(),
  /** "Chrome", "Safari"… */
  browser: z.string(),
  /** "102.89.34.x"; null when unknown. Full addresses are never stored. */
  ipMasked: z.string().nullable(),
  lastActiveAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /** "Keep me signed in" was ticked. */
  persistent: z.boolean(),
  isCurrent: z.boolean(),
})
export type SessionItem = z.infer<typeof sessionItem>

export const notice = z.object({ notice: z.string() })

export const resetTokenInput = z.strictObject({ token: z.string().min(1).max(200) })
