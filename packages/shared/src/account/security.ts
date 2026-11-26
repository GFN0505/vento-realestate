import { z } from 'zod'
import { PASSWORD_MAX_LENGTH } from '../auth/password-rules'
import { id } from '../common/schemas'
import { HIDDEN_CHARACTERS_MESSAGE, hasHiddenCharacters } from '../common/text'

const datetime = z.iso.datetime()

/** The most passkeys one person may have (spec decision 14). The database enforces it too. */
export const PASSKEY_LIMIT = 10
/** "Confirm it's you" lasts this long for the session (spec decision 6). */
export const REAUTH_WINDOW_MINUTES = 5

/**
 * Your own name on My security. Named apart from `personName` (invitations: 2–100, "Enter your
 * full name"), which keeps its rules for accepting an invitation.
 */
export const accountName = z
  .string()
  .trim()
  .min(2, { message: 'Enter your name' })
  .max(80, { message: 'Use 80 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

export const passkeyName = z
  .string()
  .trim()
  .min(1, { message: 'Enter a name' })
  .max(40, { message: 'Use 40 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

/**
 * Why two-step is required for this person. `role`: their role in `organizationName`;
 * `organization`: that organization requires it for everyone; `reset`: an owner or admin reset it
 * (applies everywhere; `organizationName` is the organization the reset came from, or the active one).
 */
export const twoStepRequirement = z.object({
  organizationName: z.string(),
  reason: z.enum(['role', 'organization', 'reset']),
  /** For "Required for your role (Finance)"; null unless `reason` is `role`. */
  roleName: z.string().nullable(),
})
export type TwoStepRequirement = z.infer<typeof twoStepRequirement>

export const passkeyItem = z.object({
  id,
  name: z.string(),
  createdAt: datetime,
  lastUsedAt: datetime.nullable(),
})
export type PasskeyItem = z.infer<typeof passkeyItem>

/** Everything My security's first three blocks show, in one call. */
export const securityOverview = z.object({
  name: z.string(),
  email: z.string(),
  /** null = "Set when you joined" (never changed since sign-up or accepting the invitation). */
  passwordChangedAt: datetime.nullable(),
  twoStep: z.object({
    enabled: z.boolean(),
    /** The first requirement, the active organization first; null when nothing requires it. */
    requiredBy: twoStepRequirement.nullable(),
    /** Unused backup codes, counted on the server; null when two-step is off. */
    backupCodesLeft: z.number().int().min(0).max(10).nullable(),
  }),
  passkeys: z.object({
    /** `platform.passkeys` is available to the active organization. false: hide the card. */
    available: z.boolean(),
    /** Newest first; [] when unavailable. */
    items: z.array(passkeyItem),
    limit: z.literal(PASSKEY_LIMIT),
  }),
  /** Skip "Confirm it's you" before this moment; null when not confirmed in this session. */
  reauthenticatedUntil: datetime.nullable(),
})
export type SecurityOverview = z.infer<typeof securityOverview>

export const confirmPasswordInput = z.strictObject({
  password: z.string().min(1, { message: 'Enter your password' }).max(PASSWORD_MAX_LENGTH),
})
export const confirmPasswordOutput = z.object({ reauthenticatedUntil: datetime })

export const updateNameInput = z.strictObject({ name: accountName })
export const updateNameOutput = z.object({ name: z.string(), notice: z.string() })

export const renamePasskeyInput = z.strictObject({ id, name: passkeyName })
export const removePasskeyInput = z.strictObject({ id })
