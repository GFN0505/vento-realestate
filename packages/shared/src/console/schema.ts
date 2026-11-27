import { z } from 'zod'
import { email } from '../access/schema'
import { accountName } from '../account/security'
import { PASSWORD_MAX_LENGTH } from '../auth/password-rules'
import { Decimal } from '../common/decimal'
import { money } from '../common/money'
import { id, isoDate, paginated, paginationInput } from '../common/schemas'
import { HIDDEN_CHARACTERS_MESSAGE, hasHiddenCharacters } from '../common/text'
import { ADD_ONS, type AddOnKey } from '../features/catalog'
import {
  countLimitKey,
  featureKey,
  limitKey,
  planDefinition,
  planLimits,
  planLimitUse,
  releaseGroup,
  releaseStage,
} from '../features/schema'

// The Vento Real Estate console's schemas (docs/plans/admin-console.md §5, §1b.11). Only `@vento/shared/console`
// exports them, so the customer web can't pull them into its bundle.

const datetime = z.iso.datetime()
const count = z.number().int().min(0)
const name = z.string()

export const addOnKey = z.enum(Object.keys(ADD_ONS) as [AddOnKey, ...AddOnKey[]])
export const overrideKind = z.enum(['release', 'feature', 'limit'])
export type OverrideKind = z.infer<typeof overrideKind>
/** Where a platform change came from. Pre-console rows are labelled at read time. */
export const platformChannel = z.enum(['console', 'command', 'scheduled'])
export type PlatformChannel = z.infer<typeof platformChannel>

export const organizationRef = z.object({ id, name })
export type OrganizationRef = z.infer<typeof organizationRef>
const personRef = z.object({ name, email: z.string() })

// ── Shared pieces of every change ────────────────────────────────────────────

/** Why the change was made. Kept in Vento's activity; the customer never sees it. */
export const reason = z
  .string()
  .trim()
  .min(3, { message: 'Add a reason so the activity says why.' })
  .max(500, { message: 'Keep the reason to 500 characters or fewer.' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

/**
 * Sent with every apply. The key is made when the confirm step opens and kept across retries, so
 * a dropped connection never applies a change twice.
 */
const change = { reason, idempotencyKey: z.uuid() }

export const previewTone = z.enum(['info', 'warning', 'danger'])
export const previewLine = z.object({ text: z.string(), tone: previewTone })
export type PreviewLine = z.infer<typeof previewLine>

/** A preview: the lines the command prints, and the state they were computed from. */
export function previewOf<E extends z.ZodType>(expected: E) {
  return z.object({ lines: z.array(previewLine), expected })
}

/** An applied change: the operation's own sentence, shown as the toast. */
export const done = z.object({ message: z.string() })
export type Done = z.infer<typeof done>

/** Monthly AI budget in naira, as a decimal string. */
export const aiBudget = money.refine((v) => new Decimal(v).gt(0), {
  message: 'Enter a monthly budget above ₦0',
})

const TRIAL_DAYS_MESSAGE = 'A trial lasts 1 to 90 days.'
export const trialDays = z
  .number({ message: TRIAL_DAYS_MESSAGE })
  .int({ message: TRIAL_DAYS_MESSAGE })
  .min(1, { message: TRIAL_DAYS_MESSAGE })
  .max(90, { message: TRIAL_DAYS_MESSAGE })

/** Last day of an override; empty = no end date. The server re-checks "today or later" in Lagos. */
export const until = isoDate.optional()

const LIMIT_MESSAGE = 'Enter a whole number, or choose Unlimited.'
/** A count limit (projects, companies, people). */
export const limitValue = z.union(
  [
    z
      .number({ message: LIMIT_MESSAGE })
      .int({ message: LIMIT_MESSAGE })
      .min(0, { message: LIMIT_MESSAGE })
      .max(9_999_999, { message: 'Use 9,999,999 or fewer.' }),
    z.literal('unlimited'),
  ],
  { message: LIMIT_MESSAGE },
)
export type LimitValue = z.infer<typeof limitValue>

/** The fields an apply adds to its preview's fields. */
function applyFields<E extends z.ZodType>(expected: E) {
  return { expected, ...change }
}

/** A change's two inputs and its preview output, from its fields and the before-state it checks. */
function changeOf<F extends z.ZodRawShape, E extends z.ZodType>(fields: F, expected: E) {
  return {
    previewInput: z.strictObject(fields),
    preview: previewOf(expected),
    applyInput: z.strictObject({ ...fields, ...applyFields(expected) }),
  }
}

// ── Access ───────────────────────────────────────────────────────────────────

export const consoleStatus = z.object({
  window: z.enum(['open', 'closed', 'two_step_required']),
  /** When the window closes unless used again; null unless open. */
  closesAt: datetime.nullable(),
  /** A passkey or code was proven in the last 5 minutes: `access.open` needs no prompt. */
  freshProof: z.boolean(),
  methods: z.object({ passkey: z.boolean() }),
})
export type ConsoleStatus = z.infer<typeof consoleStatus>

/** A WebAuthn JSON object (options out, assertion in), checked by the WebAuthn library. */
const webauthnJson = z.record(z.string(), z.unknown())
const PASSKEY_RESPONSE_MAX_BYTES = 8 * 1024

export const passkeyOptionsOutput = z.object({ options: webauthnJson })

export const confirmInput = z.discriminatedUnion('method', [
  z.strictObject({
    method: z.literal('code'),
    code: z.string().regex(/^\d{6}$/, { message: 'Enter the 6-digit code from your app' }),
  }),
  z.strictObject({
    method: z.literal('backup_code'),
    code: z.string().trim().min(1, { message: 'Enter a backup code' }).max(32),
  }),
  z.strictObject({
    method: z.literal('passkey'),
    response: webauthnJson.refine((v) => JSON.stringify(v).length <= PASSKEY_RESPONSE_MAX_BYTES, {
      message: 'That passkey response is too large',
    }),
  }),
])
export type ConfirmInput = z.infer<typeof confirmInput>

// ── Organizations ────────────────────────────────────────────────────────────

export const organizationsFilter = z.enum(['all', 'trial', 'pilot', 'internal', 'over_limit'])
export type OrganizationsFilter = z.infer<typeof organizationsFilter>

export const listOrganizationsInput = paginationInput
  .extend({
    filter: organizationsFilter.default('all'),
    /** Organization name or owner email, matched anywhere. */
    search: z.string().trim().max(100).optional(),
    /** Only organizations on this plan (plan detail's "N organizations" link). */
    planKey: planDefinition.shape.key.optional(),
    /** With `planKey`: only that version of it. */
    version: z.number().int().min(1).optional(),
  })
  .strict()
export type ListOrganizationsInput = z.input<typeof listOrganizationsInput>

export const organizationsSummary = z.object({
  organizations: count,
  people: count,
  newThisMonth: count,
  onTrial: count,
  trialsEndingThisWeek: count,
  pilot: count,
  overLimit: count,
})
export type OrganizationsSummary = z.infer<typeof organizationsSummary>

/**
 * One row of the Organizations list, sorted by last active. Facts only: the owner's name and
 * email, counts and dates. No Projects column until the projects module counts them.
 */
export const organizationRow = z.object({
  id,
  name,
  /** The earliest active owner; null when there's none. */
  owner: personRef.nullable(),
  /** null = no plan. */
  plan: z.object({ name, version: z.number().int().min(1) }).nullable(),
  releaseGroup,
  people: count,
  companies: count,
  lastActiveAt: datetime.nullable(),
  trial: z.object({ planName: name, endsOn: isoDate }).nullable(),
  overLimit: z.boolean(),
})
export type OrganizationRow = z.infer<typeof organizationRow>

const overrideFacts = {
  id,
  /** null = no end date. */
  until: datetime.nullable(),
  reason: z.string(),
  /** null = set by a scheduled run or the seed. */
  byName: name.nullable(),
  at: datetime,
  /** Part of a trial: ends with it. */
  fromTrial: z.boolean(),
}
export const featureOverride = z.object({
  kind: z.enum(['release', 'feature']),
  key: featureKey,
  enabled: z.boolean(),
  ...overrideFacts,
})
export const limitOverride = z.object({
  kind: z.literal('limit'),
  key: limitKey,
  /** A count, or naira for `ai_budget`; null = unlimited. */
  value: money.nullable(),
  ...overrideFacts,
})
export const consoleOverride = z.union([featureOverride, limitOverride])
export type ConsoleOverride = z.infer<typeof consoleOverride>

const ended = { endedAt: datetime }
export const endedOverride = z.union([featureOverride.extend(ended), limitOverride.extend(ended)])
export type EndedOverride = z.infer<typeof endedOverride>

export const organizationDetail = z.object({
  id,
  name,
  customerSince: datetime,
  releaseGroup,
  owner: personRef.nullable(),
  /** null = no plan ("No plan", **Choose a plan**). */
  plan: z
    .object({
      key: z.string(),
      name,
      version: z.number().int().min(1),
      versionId: id,
      /** Greater than `version`: "Growth v3 is available". */
      latestVersion: z.number().int().min(1),
    })
    .nullable(),
  /** Count limits with use; `included` null = no cap (and always for internal organizations). */
  limits: z.array(planLimitUse),
  trial: z
    .object({
      id,
      planKey: z.string(),
      planName: name,
      endsOn: isoDate,
      sevenDayReminderAt: datetime.nullable(),
      oneDayReminderAt: datetime.nullable(),
    })
    .nullable(),
  addOns: z.array(z.object({ id, key: addOnKey, budget: money, since: datetime })),
  /** Live overrides only. */
  overrides: z.array(consoleOverride),
  /** "3 ended": the list is `organizations.endedOverrides`. */
  endedOverrideCount: count,
})
export type OrganizationDetail = z.infer<typeof organizationDetail>

/** Why a feature is or isn't available to the organization, in the availability rule's order. */
export const featureWhy = z.object({
  key: featureKey,
  label: name,
  /** The catalog group the Features card sorts by: the module's key, or `platform`. */
  module: z.string(),
  available: z.boolean(),
  /** "Not in Starter; in Growth and Enterprise". */
  reason: z.string(),
  /** Live overrides on this feature, for the row's ⋯ menu. */
  overrideIds: z.array(id),
})
export type FeatureWhy = z.infer<typeof featureWhy>

export const organizationIdInput = z.strictObject({ id })
export const endedOverridesInput = paginationInput.extend({ id }).strict()

const organizationId = id

export const changePlan = changeOf(
  {
    organizationId,
    planKey: planDefinition.shape.key,
    /** Omitted = the latest version. */
    version: z.number().int().min(1).optional(),
  },
  z.object({ planVersionId: id.nullable() }),
)
export const startTrial = changeOf(
  { organizationId, planKey: planDefinition.shape.key, days: trialDays },
  z.object({ trialId: z.null() }),
)
export const endTrial = changeOf({ organizationId }, z.object({ trialId: id }))
export const addAi = changeOf({ organizationId, budget: aiBudget }, z.object({ addOnId: z.null() }))
export const changeAiBudget = changeOf(
  { organizationId, budget: aiBudget },
  z.object({ addOnId: id, budget: money }),
)
export const removeAi = changeOf({ organizationId }, z.object({ addOnId: id }))
export const changeReleaseGroup = changeOf(
  { organizationId, group: releaseGroup },
  z.object({ releaseGroup }),
)

// An override is on/off for a feature, or a value for a limit (naira for the AI budget).
const featureOverrideFields = {
  organizationId,
  kind: z.enum(['release', 'feature']),
  key: featureKey,
  value: z.enum(['on', 'off']),
  until,
}
const countLimitOverrideFields = {
  organizationId,
  kind: z.literal('limit'),
  key: countLimitKey,
  value: limitValue,
  until,
}
const budgetLimitOverrideFields = {
  organizationId,
  kind: z.literal('limit'),
  key: z.literal('ai_budget'),
  value: z.union([money, z.literal('unlimited')]),
  until,
}
const setOverrideExpected = z.object({ overrideId: id.nullable() })
export const setOverride = {
  previewInput: z.union([
    z.strictObject(featureOverrideFields),
    z.strictObject(countLimitOverrideFields),
    z.strictObject(budgetLimitOverrideFields),
  ]),
  preview: previewOf(setOverrideExpected),
  applyInput: z.union([
    z.strictObject({ ...featureOverrideFields, ...applyFields(setOverrideExpected) }),
    z.strictObject({ ...countLimitOverrideFields, ...applyFields(setOverrideExpected) }),
    z.strictObject({ ...budgetLimitOverrideFields, ...applyFields(setOverrideExpected) }),
  ]),
}

const clearFeatureOverrideFields = {
  organizationId,
  kind: z.enum(['release', 'feature']),
  key: featureKey,
}
const clearLimitOverrideFields = { organizationId, kind: z.literal('limit'), key: limitKey }
const clearOverrideExpected = z.object({ overrideId: id })
export const clearOverride = {
  previewInput: z.union([
    z.strictObject(clearFeatureOverrideFields),
    z.strictObject(clearLimitOverrideFields),
  ]),
  preview: previewOf(clearOverrideExpected),
  applyInput: z.union([
    z.strictObject({ ...clearFeatureOverrideFields, ...applyFields(clearOverrideExpected) }),
    z.strictObject({ ...clearLimitOverrideFields, ...applyFields(clearOverrideExpected) }),
  ]),
}

// ── Activity ─────────────────────────────────────────────────────────────────

export const activityKind = z.enum([
  'release',
  'plan',
  'trial',
  'add_on',
  'override',
  'super_admin',
])
export type ActivityKind = z.infer<typeof activityKind>

export const listActivityInput = paginationInput
  .extend({
    actorUserId: id.optional(),
    organizationId: id.optional(),
    featureKey: featureKey.optional(),
    kind: activityKind.optional(),
    /** Lagos dates, inclusive. */
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'Choose an end date on or after the start date.',
  })
export type ListActivityInput = z.input<typeof listActivityInput>

/** One platform audit event, in words. */
export const activityRow = z.object({
  id,
  at: datetime,
  actorName: name,
  /** null = a scheduled run. */
  actorUserId: id.nullable(),
  channel: platformChannel,
  /** "console · Chrome on Mac · 102.89.34.x", or the host user for a command. */
  operator: z.string().nullable(),
  /** "Moved Sales to pilot". */
  summary: z.string(),
  organization: organizationRef.nullable(),
  /** Text: older rows may name a key the code no longer has. */
  featureKey: z.string().nullable(),
  /** "internal → pilot"; null when there's no before and after to show. */
  change: z.string().nullable(),
  reason: z.string(),
})
export type ActivityRow = z.infer<typeof activityRow>

/**
 * The Activity page: the shared list shape, plus the organization's name when the list is
 * filtered by one (so the filter chip can name it even when it has no rows yet).
 */
export const activityPage = paginated(activityRow).extend({
  organizationName: z.string().nullable().optional(),
})
export type ActivityPage = z.infer<typeof activityPage>

/** Everyone who appears as an actor, for the person filter. */
export const activityPerson = z.object({ userId: id, name })

// ── Releases ─────────────────────────────────────────────────────────────────

export const releasesFilter = z.enum(['all', 'off', 'internal', 'pilot', 'on', 'in_no_plan'])
export type ReleasesFilter = z.infer<typeof releasesFilter>
export const listReleasesInput = z.strictObject({ filter: releasesFilter.default('all') })

const releaseFacts = {
  key: featureKey,
  label: name,
  module: z.string(),
  stage: releaseStage,
  /** Names of the latest plan versions that include it. */
  plans: z.array(name),
  /** In every plan: "Core". */
  core: z.boolean(),
  /** Sold with this add-on: "AI add-on". */
  addOn: addOnKey.nullable(),
}

export const releaseRow = z.object({
  ...releaseFacts,
  /** Organizations it's available to now. */
  organizations: count,
})
export type ReleaseRow = z.infer<typeof releaseRow>

/** The whole catalog (bounded, so not paginated), plus keys in data the code no longer has. */
export const releaseList = z.object({ items: z.array(releaseRow), staleKeys: z.array(z.string()) })

/** Shown per release group; the names are the first 50 A–Z, the count is all of them. */
const HOLDER_NAMES_SHOWN = 50
export const releaseDetail = z.object({
  ...releaseFacts,
  /** The latest stage change ("Off for everyone since…"); null = never set (internal). */
  stageChange: z.object({ at: datetime, byName: name.nullable(), reason: z.string() }).nullable(),
  needs: z.array(featureKey),
  holders: z.array(
    z.object({
      group: releaseGroup,
      count,
      organizations: z.array(organizationRef).max(HOLDER_NAMES_SHOWN),
    }),
  ),
  overrides: z.array(featureOverride.extend({ organization: organizationRef })),
  /** The last 10 platform events on this feature. */
  recentChanges: z.array(activityRow).max(10),
  /**
   * Every live plan's latest version, in sort order, and whether it includes the feature: the
   * feature page's *Included in* links and *Not in* (1b).
   */
  planVersions: z.array(
    z.object({ key: z.string(), name, version: z.number().int().min(1), included: z.boolean() }),
  ),
})
export type ReleaseDetail = z.infer<typeof releaseDetail>

export const releaseKeyInput = z.strictObject({ key: featureKey })
export const setStage = changeOf(
  { key: featureKey, stage: releaseStage },
  z.object({ stage: releaseStage }),
)

// ── Plans ────────────────────────────────────────────────────────────────────

export const planRow = z.object({
  key: z.string(),
  name,
  sortOrder: z.number().int(),
  defaultForNew: z.boolean(),
  latestVersion: z.number().int().min(1),
  versions: z.array(z.object({ version: z.number().int().min(1), organizations: count })),
})
export type PlanRow = z.infer<typeof planRow>

export const planDetail = z.object({
  key: z.string(),
  name,
  sortOrder: z.number().int(),
  defaultForNew: z.boolean(),
  /** Newest first. */
  versions: z.array(
    z.object({
      id,
      version: z.number().int().min(1),
      publishedAt: datetime,
      features: z.array(featureKey),
      limits: planLimits,
      organizations: count,
    }),
  ),
})
export type PlanDetail = z.infer<typeof planDetail>

export const planKeyInput = z.strictObject({ key: planDefinition.shape.key })

const publishExpected = z.object({ latestVersion: z.number().int().min(1).nullable() })
/** `isNew`: a new plan (key and name chosen here); otherwise the next version of `key`. */
export const publishPlan = {
  previewInput: planDefinition.extend({ isNew: z.boolean() }),
  preview: previewOf(publishExpected),
  applyInput: planDefinition.extend({ isNew: z.boolean(), ...applyFields(publishExpected) }),
}

// ── Super-admins ─────────────────────────────────────────────────────────────

export const superAdminRow = z.object({
  userId: id,
  name,
  email: z.string(),
  since: datetime,
  /** Shown as **Invited by**; null = the bootstrap grant or invitation. */
  grantedByName: name.nullable(),
  lastConsoleAt: datetime.nullable(),
  /** No **Remove** on your own row. */
  isYou: z.boolean(),
  /** ⋯ **Reset two-step**: not you, and two-step is on. */
  canResetTwoStep: z.boolean(),
})
export type SuperAdminRow = z.infer<typeof superAdminRow>

// The operations refuse duplicates and self-removal, so there's no before-state to compare.
const noExpected = z.strictObject({})
export const removeSuperAdmin = changeOf({ userId: id }, noExpected)

// ── Staff invitations (1b) ───────────────────────────────────────────────────

/**
 * Invite someone to become a super-admin. The operation refuses a customer account's email, an
 * active super-admin, an open invitation (`next: 'resend_invitation'`) and a sixth open one.
 */
export const inviteSuperAdmin = changeOf({ email, name: accountName }, noExpected)

/**
 * An open staff invitation on the Super-admins page. `expired` is worked out when read (48 hours
 * after it was last sent); it can still be resent or withdrawn.
 */
export const staffInvitationRow = z.object({
  id,
  email: z.string(),
  name,
  /** null = the bootstrap invitation from the command line. */
  invitedByName: name.nullable(),
  expiresAt: datetime,
  status: z.enum(['pending', 'expired']),
  /** **Resend** is disabled until then (once a minute). */
  resendableAt: datetime,
})
export type StaffInvitationRow = z.infer<typeof staffInvitationRow>

/** Resending has no confirm step: a new link, a fresh 48 hours, the invitation's own reason. */
export const resendStaffInvitationInput = z.strictObject({
  invitationId: id,
  idempotencyKey: z.uuid(),
})

/** `expected` catches an invitation accepted or withdrawn since the confirm opened. */
export const withdrawStaffInvitation = changeOf(
  { invitationId: id },
  z.object({ status: z.literal('pending') }),
)

/** Another super-admin's lost two-step. Refused on your own row and for anyone not a super-admin. */
export const resetSuperAdminTwoStep = changeOf({ userId: id }, noExpected)

// ── Staff sign-up (1b, public) ───────────────────────────────────────────────

/** The token from the link. Its length is only a bound; an unknown token reads as expired. */
export const staffInvitationToken = z.string().min(1).max(200)
export const staffJoinGetInput = z.strictObject({ token: staffInvitationToken })

/** `customer_account`: the email got a customer account after the invitation was sent. */
export const staffJoinStatus = z.enum([
  'pending',
  'expired',
  'withdrawn',
  'accepted',
  'customer_account',
])
export type StaffJoinStatus = z.infer<typeof staffJoinStatus>

/**
 * What the staff sign-up page shows. A token we don't recognise answers `expired` with every
 * other field null, so a guessed link learns nothing.
 */
export const staffJoinPreview = z.object({
  status: staffJoinStatus,
  email: z.string().nullable(),
  name: name.nullable(),
  /** null = the bootstrap invitation, or an unknown link. */
  inviterName: name.nullable(),
  expiresAt: datetime.nullable(),
  /** The password was set on an earlier visit: ask only for it and go on at two-step. */
  resume: z.boolean(),
})
export type StaffJoinPreview = z.infer<typeof staffJoinPreview>

/**
 * Step 1. A new account checks the password rules on the server (BAD_REQUEST with the rule's
 * reason); on resume it's the password already set, and `name` is ignored.
 */
export const staffJoinStartInput = z.strictObject({
  token: staffInvitationToken,
  name: accountName.optional(),
  password: z
    .string()
    .min(1, { message: 'Enter your password' })
    .max(PASSWORD_MAX_LENGTH, { message: `Use ${PASSWORD_MAX_LENGTH} characters or fewer` }),
})
export type StaffJoinStartInput = z.infer<typeof staffJoinStartInput>

/** `sign_in`: the account was made but signing in failed (rare); send them to sign in. */
export const staffJoinStartOutput = z.object({ next: z.enum(['two_step', 'sign_in']) })

// ── Dashboard (1b) ───────────────────────────────────────────────────────────
// Account-level facts only: counts, dates and organization names. Nothing here can carry a
// member's name or email, an IP or a device, so the Dashboard can't leak them (spec, NDPA).
// Internal organizations are left out of every number, queue row and feed row.

/** One Needs attention row, each with the one action that resolves it. In spec order. */
export const attentionItem = z.discriminatedUnion('kind', [
  /** A command-line change in the last 7 days ("Ada Okafor moved Sales to off"). Opens Activity. */
  z.object({
    kind: z.literal('command_line'),
    eventId: id,
    at: datetime,
    actorName: name,
    summary: z.string(),
  }),
  /** "Lekki Partners Ltd · Enterprise trial ends in 2 days". */
  z.object({
    kind: z.literal('trial_ending'),
    organization: organizationRef,
    planName: name,
    endsOn: isoDate,
  }),
  /** "Parkview Homes · People 17 of 15": the limit with the largest excess. */
  z.object({
    kind: z.literal('over_limit'),
    organization: organizationRef,
    limit: countLimitKey,
    used: count,
    included: count,
  }),
  /** **Choose a plan**. */
  z.object({ kind: z.literal('no_plan'), organization: organizationRef }),
  /** "nobody active for 18 days" (counted from creation when nobody was ever active). */
  z.object({ kind: z.literal('quiet'), organization: organizationRef, days: count }),
])
export type AttentionItem = z.infer<typeof attentionItem>

/** The notable customer account events the feed shows, from their audit actions. */
export const customerActivityKind = z.enum([
  /** `organization.created` */
  'signed_up',
  /** `entity.created` */
  'added_company',
  /** `invitation.accepted` */
  'people_joined',
  /** `member.removed` */
  'people_removed',
  /** `member.access_changed` to the owner role */
  'new_owner',
  /** `two_step.reset` */
  'two_step_reset',
  /** `auth.locked_out` */
  'sign_in_locked',
  /** `passkey.suspected_clone` */
  'possible_copied_passkey',
])
export type CustomerActivityKind = z.infer<typeof customerActivityKind>

/** Events of one kind, for one organization, on one Lagos day: "3 people joined · today". */
export const feedRow = z.object({
  organization: organizationRef,
  kind: customerActivityKind,
  day: isoDate,
  count: z.number().int().min(1),
  latestAt: datetime,
})
export type FeedRow = z.infer<typeof feedRow>

const ATTENTION_ROWS_SHOWN = 8
const FEED_ROWS_SHOWN = 15
const RECENT_CHANGES_SHOWN = 5

export const dashboard = z.object({
  /** "214 organizations · 3,912 people" (distinct people with an active membership). */
  header: z.object({ organizations: count, people: count }),
  numbers: z.object({
    organizations: count,
    newLast7Days: count,
    activePeople: count,
    activeOrganizations: count,
    trialsEndingSoon: count,
    overLimit: count,
    /** "5 more at a limit": at a limit exactly, not over one. */
    atLimit: count,
  }),
  attention: z.object({
    items: z.array(attentionItem).max(ATTENTION_ROWS_SHOWN),
    /** "and 6 more": the rows left after the first 8. */
    more: count,
  }),
  activity: z.object({
    /** Last 7 days. */
    summary: z.object({
      newOrganizations: count,
      invitationsSent: count,
      invitationsAccepted: count,
      trialsStarted: count,
      /** A count only: never who. */
      signUpsNotFinished: count,
    }),
    /** Newest first. */
    feed: z.array(feedRow).max(FEED_ROWS_SHOWN),
  }),
  plans: z.object({
    /** Live plans in sort order; versions newest first. */
    byPlan: z.array(
      z.object({
        key: z.string(),
        name,
        total: count,
        versions: z.array(z.object({ version: z.number().int().min(1), organizations: count })),
      }),
    ),
    internal: count,
    noPlan: count,
    atPilot: z.array(featureKey),
    recent: z.array(activityRow).max(RECENT_CHANGES_SHOWN),
  }),
})
export type Dashboard = z.infer<typeof dashboard>

const ACCOUNT_ACTIVITY_ROWS_SHOWN = 30
/** Organization detail's Account activity card: "9 of 11 people active in the last 7 days". */
export const accountActivity = z.object({
  people: count,
  activeLast7Days: count,
  /** null = nobody has been active yet. */
  lastActiveAt: datetime.nullable(),
  /** This organization's feed rows for 30 days, newest first. */
  feed: z.array(feedRow).max(ACCOUNT_ACTIVITY_ROWS_SHOWN),
})
export type AccountActivity = z.infer<typeof accountActivity>
