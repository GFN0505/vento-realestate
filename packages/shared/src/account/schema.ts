import { z } from 'zod'
import { systemRoleKey } from '../access/default-roles'
import { permissionSet } from '../access/permissions'
import { id } from '../common/schemas'
import { availableFeature, mePlan } from '../features/schema'
import { twoStepRequirement } from './security'

/** Where the web sends a signed-in person next. The server decides; the web only follows. */
export const nextStep = z.enum([
  'onboarding_organization',
  'onboarding_entity',
  'two_step_setup',
  'ready',
  /** An active super-admin (a staff account): the Vento Real Estate console (`/console`). */
  'console',
])
export type NextStep = z.infer<typeof nextStep>

export const roleRef = z.object({ id, key: systemRoleKey.nullable(), name: z.string() })
export type RoleRef = z.infer<typeof roleRef>

/** An organization the person is an active member of, for the organization switcher. */
export const organizationOption = z.object({ id, name: z.string(), roleName: z.string() })
export type OrganizationOption = z.infer<typeof organizationOption>

export const me = z.object({
  user: z.object({
    id,
    name: z.string(),
    email: z.string(),
    twoFactorEnabled: z.boolean(),
    /** Typed at sign-up; pre-fills onboarding step 1. */
    companyName: z.string().nullable(),
  }),
  organization: z
    .object({
      id,
      name: z.string(),
      /** A Vento demo or test organization: unbuilt modules show "Soon" here only. */
      internal: z.boolean(),
    })
    .nullable(),
  /** Features available to the organization (released and entitled). [] with no organization. */
  features: z.array(availableFeature),
  /** Owners only: plan, limits with use, trial, upgrade hints, contact. null for everyone else. */
  plan: mePlan.nullable(),
  /** Every active membership, by organization name. The switcher shows when there are two or more. */
  organizations: z.array(organizationOption),
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
  /**
   * Two-step is required here now: the role, an owner or admin's reset, or the organization's
   * "Require two-step for everyone" (also during its 7-day grace).
   */
  twoStepRequired: z.boolean(),
  /** What requires it, active organization first, for My security's line; null when nothing does. */
  twoStepRequiredBy: twoStepRequirement.nullable(),
  /**
   * The organization requires two-step for everyone and this person hasn't set it up yet, but may
   * keep working until this moment (the banner's deadline). null outside that grace period.
   */
  twoStepSetupBy: z.iso.datetime().nullable(),
  /**
   * Settings create and all-companies access: show "+ Add company" (switcher, Home, ⌘K). The
   * web still ANDs it with the previewed role's permissions.
   */
  canAddCompany: z.boolean(),
  /**
   * Set only for an active super-admin (a Vento Real Estate staff account): the console's state.
   * null for everyone else, revoked super-admins included.
   */
  console: z.object({ twoStepOn: z.boolean() }).nullable(),
  /** Requests whose current step the person may decide now: the top bar's Approvals count. */
  approvalsWaiting: z.number().int().min(0),
  /**
   * Show Approvals (nav, top bar, ⌘K): the role can approve in some module, or the person made a
   * request in the last 90 days. Cosmetic only: every approvals procedure filters on the server.
   */
  canSeeApprovals: z.boolean(),
})
export type Me = z.infer<typeof me>

export const switchOrganizationInput = z.strictObject({ organizationId: id })
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationInput>

export const switchOrganizationOutput = z.object({
  organization: z.object({ id, name: z.string() }),
  /** Where to go in the new organization, e.g. two-step setup when its role needs it. */
  nextStep,
})
export type SwitchOrganizationOutput = z.infer<typeof switchOrganizationOutput>

export const sessionItem = z.object({
  id,
  /** "iPhone", "Mac", "Windows PC", "Android phone"… */
  device: z.string(),
  /** "Chrome", "Safari"… */
  browser: z.string(),
  /** "102.89.34.x"; null when unknown. Full addresses are never stored. */
  ipMasked: z.string().nullable(),
  /** Approximate place worked out at sign-in, "Lekki, Lagos"; null when unknown. */
  place: z.string().nullable(),
  lastActiveAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /** "Keep me signed in" was ticked. */
  persistent: z.boolean(),
  isCurrent: z.boolean(),
})
export type SessionItem = z.infer<typeof sessionItem>

export const notice = z.object({ notice: z.string() })

export const resetTokenInput = z.strictObject({ token: z.string().min(1).max(200) })
