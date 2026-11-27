import type { SystemRoleKey } from '../access/default-roles'
import type { PermissionModule } from '../access/permissions'

// Metadata only (decision 0024): the web shows labels and chips from here, and the API's
// plug-in registry must have exactly these keys (tested there). No server code in this file.

/** What the detail's primary button needs to name the effect ("Make Aisha Bello an owner"). */
export type ApproveLabelInput = { title: string; recordLabel: string; amountText: string | null }

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
  /** Imperative, for the rules page and the rule sheet's Action list. */
  label: string
  /** The inbox row's type chip. */
  chip: string
  /** Rules may say "Over ₦X" only when the action carries an amount. */
  hasAmount: boolean
  /** Approving asks once more, with the amount (payroll, payment out). */
  irreversible: boolean
  /** Nobody else eligible: go ahead and mark the audit entry, or refuse before saving anything. */
  whenNoApprover: 'proceed' | 'refuse'
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
] as const
export type ApprovalActionKey = (typeof APPROVAL_ACTION_KEYS)[number]

export const APPROVAL_ACTIONS: Readonly<Record<ApprovalActionKey, ApprovalActionMeta>> = {
  'access.role.update': {
    module: 'settings',
    label: "Change a role's permissions",
    chip: 'Roles',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'proceed',
    extraCondition: "Can't give access the approver doesn't have",
    rulesFrom: null,
    approveLabel: () => 'Approve role change',
    defaults: [{ minAmount: null, steps: [['owner', 'admin']] }],
  },
  'access.member.make_owner': {
    module: 'settings',
    label: 'Make someone an owner',
    chip: 'Owners',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'proceed',
    extraCondition: 'Not the person being made an owner',
    rulesFrom: null,
    approveLabel: (s) => `Make ${s.recordLabel} an owner`,
    defaults: [{ minAmount: null, steps: [['owner']] }],
  },
  'access.invitation.owner': {
    module: 'settings',
    label: 'Invite someone as an owner',
    chip: 'Owners',
    hasAmount: false,
    irreversible: false,
    whenNoApprover: 'proceed',
    extraCondition: null,
    // Plan question 2: covered by "Make someone an owner", so inviting can't bypass it.
    rulesFrom: 'access.member.make_owner',
    approveLabel: (s) => `Invite ${s.recordLabel} as an owner`,
    defaults: [],
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
