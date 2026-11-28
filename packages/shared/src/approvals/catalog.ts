import type { SystemRoleKey } from '../access/default-roles'
import type { PermissionModule } from '../access/permissions'
import type { FeatureKey } from '../features/catalog'

// Metadata only (decision 0024): the web shows labels and chips from here, and the API's
// plug-in registry must have exactly these keys (tested there). No server code in this file.

/** What the detail's primary button needs to name the effect ("Make Aisha Bello an owner"). */
export type ApproveLabelInput = {
  title: string
  recordLabel: string
  amountText: string | null
  /** The plug-in's own words for the effect ("Clear caveat and unblock sales"), when it gave any. */
  actionLabel?: string | null
}

/** A default rule, by built-in role keys; turned into role ids per organization. */
export type DefaultApprovalRule = {
  /** "Over" this NGN amount (decimal string); null = any amount. */
  minAmount: string | null
  /** 1–3 steps, each one or more built-in roles. */
  steps: readonly (readonly SystemRoleKey[])[]
}

export type ApprovalActionMeta = {
  /** Approvers need Approve in this module; the audit and inbox file the request here. */
  module: PermissionModule
  /**
   * The feature the action belongs to: its rules show (and can be written) only where the
   * organization has it. null for platform actions, available everywhere.
   */
  feature: FeatureKey | null
  /** Imperative, for the rules page and the rule sheet's Action list. */
  label: string
  /** The action as a subject, for refusals: "Clearing an encumbrance needs an approval rule…". */
  doing: string
  /** The inbox row's type chip. */
  chip: string
  /** Rules may say "Over ₦X" only when the action carries an amount. */
  hasAmount: boolean
  /** Approving asks once more, with the amount (payroll, payment out). */
  irreversible: boolean
  /**
   * Some step has nobody eligible (the maker, the excluded and anyone needed for another step
   * don't count): go ahead and mark the audit entry, or refuse before saving anything.
   * `sole_owner`: go ahead only when the maker is the organization's only active owner, and
   * refuse while any other owner exists, so demoting or limiting the other owners can't be used
   * to make an owner with nobody watching (security M1).
   */
  whenNoApprover: 'proceed' | 'refuse' | 'sole_owner'
  /**
   * No rule matches (decision 0026): `run` goes ahead at once, so owners can switch approval off
   * (decision 0024); `refuse` refuses before anything is saved, for actions that must never run
   * on one person's word.
   */
  whenNoRule: 'run' | 'refuse'
  /** Fixed text in the rules table's Extra condition column; null = none. */
  extraCondition: string | null
  /**
   * Another action whose rules this one uses, so it can't be used to dodge them (inviting an
   * owner instead of making one). Such an action has no rules or defaults of its own.
   */
  rulesFrom: ApprovalActionKey | null
  approveLabel: (s: ApproveLabelInput) => string
  defaults: readonly DefaultApprovalRule[]
}

export const APPROVAL_ACTION_KEYS = [
  'access.role.update',
  'access.member.make_owner',
  'access.invitation.owner',
  'land.encumbrance.clear',
] as const
export type ApprovalActionKey = (typeof APPROVAL_ACTION_KEYS)[number]

export const APPROVAL_ACTIONS: Readonly<Record<ApprovalActionKey, ApprovalActionMeta>> = {
  'access.role.update': {
    module: 'settings',
    feature: null,
    label: "Change a role's permissions",
    doing: "Changing a role's permissions",
    chip: 'Roles',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'proceed',
    whenNoRule: 'run',
    extraCondition: "Can't give access the approver doesn't have",
    rulesFrom: null,
    approveLabel: () => 'Approve role change',
    defaults: [{ minAmount: null, steps: [['owner', 'admin']] }],
  },
  'access.member.make_owner': {
    module: 'settings',
    feature: null,
    label: 'Make someone an owner',
    doing: 'Making someone an owner',
    chip: 'Owners',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'sole_owner',
    whenNoRule: 'run',
    extraCondition: 'Not the person being made an owner',
    rulesFrom: null,
    approveLabel: (s) => `Make ${s.recordLabel} an owner`,
    defaults: [{ minAmount: null, steps: [['owner']] }],
  },
  'access.invitation.owner': {
    module: 'settings',
    feature: null,
    label: 'Invite someone as an owner',
    doing: 'Inviting someone as an owner',
    chip: 'Owners',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'sole_owner',
    whenNoRule: 'run',
    extraCondition: null,
    // Plan question 2: covered by "Make someone an owner", so inviting can't bypass it.
    rulesFrom: 'access.member.make_owner',
    approveLabel: (s) => `Invite ${s.recordLabel} as an owner`,
    defaults: [],
  },
  // Land & title slice 2: clearing unblocks sales, so it never runs on one person's word, even
  // when the rule is deleted or narrowed (decision 0026).
  'land.encumbrance.clear': {
    module: 'land',
    feature: 'land',
    label: 'Clear an encumbrance',
    doing: 'Clearing an encumbrance',
    chip: 'Land',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'refuse',
    whenNoRule: 'refuse',
    extraCondition: null,
    rulesFrom: null,
    approveLabel: (s) => s.actionLabel ?? 'Clear encumbrance',
    defaults: [{ minAmount: null, steps: [['land_legal', 'finance', 'admin'], ['owner']] }],
  },
}

export function isApprovalActionKey(value: string): value is ApprovalActionKey {
  return (APPROVAL_ACTION_KEYS as readonly string[]).includes(value)
}

/** The action whose rules apply to `key`: itself, or the one named in `rulesFrom`. */
export function ruleActionKey(key: ApprovalActionKey): ApprovalActionKey {
  return APPROVAL_ACTIONS[key].rulesFrom ?? key
}

/** Actions an owner can write rules for (the rule sheet's Action list), in catalog order. */
export const RULE_ACTION_KEYS: readonly ApprovalActionKey[] = APPROVAL_ACTION_KEYS.filter(
  (k) => APPROVAL_ACTIONS[k].rulesFrom === null,
)
