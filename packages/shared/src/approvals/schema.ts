import { z } from 'zod'
import { permissionModule } from '../access/permissions'
import { entityRef } from '../access/schema'
import { Decimal } from '../common/decimal'
import { money } from '../common/money'
import { currency, id, paginated, paginationInput } from '../common/schemas'
import { APPROVAL_ACTION_KEYS, APPROVAL_ACTIONS, type ApprovalActionKey } from './catalog'
import { APPROVAL_COPY } from './copy'
import { APPROVAL_TEXT_MAX } from './outcome'

const datetime = z.iso.datetime()

export const approvalActionKey = z.enum(APPROVAL_ACTION_KEYS)

export const MAX_APPROVAL_STEPS = 3
export const MAX_ROLES_PER_STEP = 9

/** `pending → approved | rejected | cancelled | expired`. */
export const approvalStatus = z.enum(['pending', 'approved', 'rejected', 'cancelled', 'expired'])
export type ApprovalStatus = z.infer<typeof approvalStatus>

/**
 * Why a request ended without a decision: `timeout` (7 days), `stale` (the record changed),
 * `maker_left` (removed from the organization), `maker` (cancelled by the maker).
 */
export const approvalEndedReason = z.enum(['timeout', 'stale', 'maker_left', 'maker'])
export type ApprovalEndedReason = z.infer<typeof approvalEndedReason>

export const approvalDecision = z.enum(['approve', 'reject'])
export type ApprovalDecision = z.infer<typeof approvalDecision>

// ---------------------------------------------------------------------------------------------
// Rules

/** *Any amount*, or *Over ₦X* (base currency) for actions that carry an amount. */
export const approvalWhen = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('any') }),
  z.object({
    kind: z.literal('over'),
    amount: money.refine((v) => new Decimal(v).gt(0), { message: 'Enter an amount above ₦0' }),
  }),
])
export type ApprovalWhen = z.infer<typeof approvalWhen>

const ruleFields = {
  actionKey: approvalActionKey,
  when: approvalWhen,
  /** 1–3 steps in order, each 1–9 role ids. The same role in two steps means two people. */
  steps: z
    .array(
      z
        .array(id)
        .min(1, { message: 'Choose at least one role for each step' })
        .max(MAX_ROLES_PER_STEP, { message: `Choose up to ${MAX_ROLES_PER_STEP} roles per step` }),
    )
    .min(1, { message: 'Add at least one approver' })
    .max(MAX_APPROVAL_STEPS, { message: `Add up to ${MAX_APPROVAL_STEPS} steps` }),
  /** 'all' = every company, now and later. */
  entityIds: z.union([
    z.literal('all'),
    z.array(id).min(1, { message: 'Choose at least one company' }).max(100),
  ]),
}

type RuleShape = {
  actionKey: ApprovalActionKey
  when: ApprovalWhen
  steps: string[][]
  entityIds: 'all' | string[]
}

// Business rules zod can check without the database; roles and duplicates are the service's.
function checkRule(v: RuleShape, ctx: z.RefinementCtx): void {
  const meta = APPROVAL_ACTIONS[v.actionKey]
  if (meta.rulesFrom !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['actionKey'],
      message: `${meta.label} follows the rules for ${APPROVAL_ACTIONS[meta.rulesFrom].label}`,
    })
  }
  if (v.when.kind === 'over' && !meta.hasAmount) {
    ctx.addIssue({
      code: 'custom',
      path: ['when'],
      message: `${meta.label} has no amount. Choose Any amount.`,
    })
  }
  v.steps.forEach((step, i) => {
    if (new Set(step).size !== step.length) {
      ctx.addIssue({ code: 'custom', path: ['steps', i], message: 'Choose each role once' })
    }
  })
  if (v.entityIds !== 'all' && new Set(v.entityIds).size !== v.entityIds.length) {
    ctx.addIssue({ code: 'custom', path: ['entityIds'], message: 'Choose each company once' })
  }
}

/** The rule sheet. The same schema drives the form, so messages are for the owner. */
export const approvalRuleInput = z.strictObject(ruleFields).superRefine(checkRule)
export type ApprovalRuleInput = z.input<typeof approvalRuleInput>

export const updateApprovalRuleInput = z
  .strictObject({
    id,
    /** The version the sheet loaded; a newer one is CONFLICT `approval_rule_changed`. */
    version: z.number().int().min(1),
    ...ruleFields,
  })
  .superRefine(checkRule)
export type UpdateApprovalRuleInput = z.input<typeof updateApprovalRuleInput>

/** The version the page loaded (security L3); a newer one is CONFLICT `approval_rule_changed`. */
export const deleteApprovalRuleInput = z.strictObject({
  id,
  version: z.number().int().min(1),
})
export type DeleteApprovalRuleInput = z.input<typeof deleteApprovalRuleInput>

export const approvalRuleRoleRef = z.object({ id, name: z.string() })

export const approvalRuleStep = z.object({
  position: z.number().int().min(1).max(MAX_APPROVAL_STEPS),
  roles: z.array(approvalRuleRoleRef),
  /** "Owner or Admin". */
  text: z.string(),
})
export type ApprovalRuleStep = z.infer<typeof approvalRuleStep>

/** "Nobody can approve step 2 in Parkview SPV": a step with no eligible person today. */
export const approvalRuleGap = z.object({
  position: z.number().int().min(1).max(MAX_APPROVAL_STEPS),
  /** null for organization-wide actions or "all companies" as a whole. */
  entity: entityRef.nullable(),
  text: z.string(),
})

export const approvalRuleRow = z.object({
  id,
  version: z.number().int().min(1),
  actionKey: approvalActionKey,
  /** "Over" this NGN amount; null = any amount. */
  minAmount: z.string().nullable(),
  /** "Any amount" or "Over ₦5,000,000". */
  whenText: z.string(),
  steps: z.array(approvalRuleStep),
  /** "Finance → MD". */
  chain: z.string(),
  /** 'all', or the named companies (archived ones are kept, shown greyed). */
  entities: z.union([z.literal('all'), z.array(entityRef.extend({ archived: z.boolean() }))]),
  /** The catalog's fixed text; null = none. */
  extraCondition: z.string().nullable(),
  gaps: z.array(approvalRuleGap),
  updatedAt: datetime,
})
export type ApprovalRuleRow = z.infer<typeof approvalRuleRow>

/** One action on the rules page: its rules and the "Below ₦X: no approval needed" line. */
export const approvalRuleGroup = z.object({
  actionKey: approvalActionKey,
  label: z.string(),
  module: permissionModule,
  belowThreshold: z.string().nullable(),
  rules: z.array(approvalRuleRow),
  /**
   * Actions that refuse without a rule (decision 0026): companies no rule covers, where the
   * action is refused. `entity` null: no rule at all. Always empty for the others.
   */
  uncovered: z.array(z.object({ entity: entityRef.nullable(), text: z.string() })),
})

export const approvalRulesList = z.object({
  /** Every action an owner can write rules for, in catalog order, with or without rules. */
  items: z.array(approvalRuleGroup),
  /** Owner with all-company access: Add, Edit and Delete show. Everyone else reads. */
  canEdit: z.boolean(),
})
export type ApprovalRulesList = z.infer<typeof approvalRulesList>

// ---------------------------------------------------------------------------------------------
// Requests

/** A foreign amount keeps its NGN value at the module's recorded rate; rules compare that. */
export const approvalAmount = z.object({
  value: z.string(),
  currency,
  ngnValue: z.string(),
})
export type ApprovalAmount = z.infer<typeof approvalAmount>

/** One row of the Field · Before · After table; null renders as "—". */
export const approvalChange = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  /**
   * An app path to what `after` names, e.g. the exact evidence version a clearing request was
   * made with (security M1). Optional: summaries stored before it existed still parse.
   */
  link: z.string().nullish(),
})
export type ApprovalChange = z.infer<typeof approvalChange>

/** What the plug-in's `describe` computed once at request time. Never secrets or raw ids. */
export const approvalSummary = z.object({
  /** "Discount 8% · Unit C-05", "Site engineer: permissions". */
  title: z.string(),
  /** "Victoria Gardens C-05", "Site engineer". */
  recordLabel: z.string(),
  /** An app path ("/settings/roles/…"); null when the record has no page. */
  recordLink: z.string().nullable(),
  amount: approvalAmount.nullable(),
  changes: z.array(approvalChange),
  /**
   * The approve button's words when the plug-in has its own ("Clear caveat and unblock sales").
   * Optional: summaries stored before it existed still parse.
   */
  actionLabel: z.string().nullish(),
})
export type ApprovalSummary = z.infer<typeof approvalSummary>

export const approvalsTab = z.enum(['waiting', 'mine', 'decided'])
export type ApprovalsTab = z.infer<typeof approvalsTab>

export const listApprovalsInput = paginationInput
  .extend({
    /** waiting: oldest first; mine and decided: newest first. */
    tab: approvalsTab.default('waiting'),
    /** The company switcher (decision 0014), intersected with the viewer's access. */
    entityId: id.optional(),
  })
  .strict()
export type ListApprovalsInput = z.input<typeof listApprovalsInput>

export const approvalRequestRow = z.object({
  id,
  actionKey: approvalActionKey,
  /** From the catalog: "Roles", "Owners", later "Purchase", "Discount". */
  chip: z.string(),
  title: z.string(),
  amount: approvalAmount.nullable(),
  makerName: z.string(),
  reason: z.string(),
  status: approvalStatus,
  endedReason: approvalEndedReason.nullable(),
  currentStep: z.number().int().min(1),
  stepCount: z.number().int().min(1).max(MAX_APPROVAL_STEPS),
  /** While pending, the current step's roles: "Finance", "Owner or Admin". */
  waitingFor: z.string().nullable(),
  /** The decision that ended it or the latest one: "Approved by Aisha Bello", "Rejected: …". */
  lastDecision: z
    .object({ name: z.string(), decision: approvalDecision, comment: z.string().nullable() })
    .nullable(),
  entity: entityRef.nullable(),
  createdAt: datetime,
  decidedAt: datetime.nullable(),
})
export type ApprovalRequestRow = z.infer<typeof approvalRequestRow>

export const listApprovalsOutput = paginated(approvalRequestRow).extend({
  /** "Waiting for me · 4", whatever the tab. */
  waitingCount: z.number().int().min(0),
})
export type ListApprovalsOutput = z.infer<typeof listApprovalsOutput>

/** A step on the TimelineItem chain. */
export const approvalRequestStep = z.object({
  position: z.number().int().min(1).max(MAX_APPROVAL_STEPS),
  /** "Owner or Admin". */
  text: z.string(),
  state: z.enum(['approved', 'rejected', 'waiting', 'upcoming', 'not_reached']),
  decision: z
    .object({
      memberName: z.string(),
      decision: approvalDecision,
      comment: z.string().nullable(),
      decidedAt: datetime,
    })
    .nullable(),
  /** The viewer is eligible for this step (only ever the current one). */
  isYou: z.boolean(),
})
export type ApprovalRequestStep = z.infer<typeof approvalRequestStep>

export const approvalRequestDetail = approvalRequestRow.extend({
  module: permissionModule,
  summary: approvalSummary,
  /** Written from the rule at request time: "Change a role's permissions needs approval by …". */
  policy: z.string(),
  steps: z.array(approvalRequestStep),
  /** "Approve role change", "Make Aisha Bello an owner". */
  approveLabel: z.string(),
  /** Approving asks once more, with the amount. */
  irreversible: z.boolean(),
  isOwn: z.boolean(),
  /** Eligible for the current step right now. */
  canDecide: z.boolean(),
  /** Why not, when the viewer sees it but can't decide ("You recorded this receipt, so …"). */
  blockedReason: z.string().nullable(),
  /** The maker, while pending. */
  canCancel: z.boolean(),
  /** The own-request note: "Aisha Bello (Finance) will review it."; null otherwise. */
  reviewerHint: z.string().nullable(),
  /** Why it ended without a decision: "Site engineer changed after this was asked…". */
  endedNote: z.string().nullable(),
  expiresAt: datetime,
})
export type ApprovalRequestDetail = z.infer<typeof approvalRequestDetail>

/** Approve or reject the current step. Rejecting needs a comment. */
export const decideInput = z
  .strictObject({
    requestId: id,
    decision: approvalDecision,
    /**
     * The step the viewer was looking at. When it was decided meanwhile, CONFLICT
     * `approval_decided` ("Aisha Bello approved this a moment ago.") instead of deciding the next.
     */
    step: z.number().int().min(1).max(MAX_APPROVAL_STEPS).optional(),
    comment: z
      .string()
      .trim()
      .max(APPROVAL_TEXT_MAX, { message: `Keep the comment under ${APPROVAL_TEXT_MAX} characters` })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'reject' && !v.comment) {
      ctx.addIssue({ code: 'custom', path: ['comment'], message: APPROVAL_COPY.commentRequired })
    }
  })
export type DecideInput = z.input<typeof decideInput>

export const decideOutput = z.object({
  notice: z.string(),
  /** The last step was approved and the action ran. */
  ran: z.boolean(),
})

/** The record a guarded action works on (`role` + id, `member` + id). */
export const approvalSubject = z.strictObject({
  type: z.string().trim().min(1).max(40),
  id,
})
export type ApprovalSubject = z.infer<typeof approvalSubject>

export const previewApprovalInput = z.strictObject({
  actionKey: approvalActionKey,
  subject: approvalSubject,
  /** For company-scoped actions; organization-wide ones leave it out. */
  entityId: id.optional(),
  /** For actions with an amount: the NGN value the module will record. */
  ngnAmount: money.optional(),
})
export type PreviewApprovalInput = z.input<typeof previewApprovalInput>

/** Drives the save bar wording and the send sheet's chain. */
export const previewApprovalOutput = z.discriminatedUnion('needed', [
  z.object({ needed: z.literal(false) }),
  z.object({
    needed: z.literal(true),
    /** "Needs approval by Finance, then MD." */
    chain: z.string(),
    policy: z.string(),
    /** Set when the action would be refused (nobody else can approve a money action). */
    blocked: z.string().nullable(),
    /**
     * A step has nobody to approve it, but the action may go ahead anyway (a role change, or the
     * organization's only owner making an owner): it takes effect at once, noted in the audit log,
     * so the web confirms instead of asking for approval.
     */
    proceedsWithoutApprover: z.boolean(),
    /** A request already waits for this record and action. */
    pendingRequestId: id.nullable(),
  }),
])
export type PreviewApprovalOutput = z.infer<typeof previewApprovalOutput>
