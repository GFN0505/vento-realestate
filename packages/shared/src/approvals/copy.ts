import { MODULE_LABELS, type PermissionModule } from '../access/permissions'
import { Decimal } from '../common/decimal'
import type { Currency } from '../common/schemas'
import { joinNames } from '../common/text'
import { APPROVAL_ACTIONS, type ApprovalActionKey } from './catalog'

// Words shared by the rules page, the inbox, the send sheet and the emails, so they can't drift.

const SYMBOLS: Record<Currency, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' }

/**
 * "₦5,000,000" or "₦1,250,000.50" from a decimal string, without going through a float. Kobo
 * show only when there are any.
 */
export function formatAmount(amount: string, currency: Currency): string {
  const value = new Decimal(amount)
  const sign = value.isNegative() && !value.isZero() ? '−' : ''
  const fixed = value.abs().toFixed(2)
  const [whole = '0', kobo = '00'] = fixed.split('.')
  const grouped = groupDigits(whole)
  return `${sign}${SYMBOLS[currency]}${grouped}${kobo === '00' ? '' : `.${kobo}`}`
}

/** "64210" → "64,210". Digits only; callers handle sign and decimals. */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** One step's roles: "Finance", "Owner or Admin", "Owner, Admin or Finance". */
export function stepText(roleNames: readonly string[]): string {
  if (roleNames.length <= 1) return roleNames[0] ?? ''
  return `${roleNames.slice(0, -1).join(', ')} or ${roleNames[roleNames.length - 1]}`
}

/**
 * The rules table's "Approved by": "Finance → MD", "Owner or Admin". Steps hold role ids; a role
 * missing from `roleNames` (deleted meanwhile) reads "a removed role" rather than an id.
 */
export function chainText(
  steps: readonly (readonly string[])[],
  roleNames: Readonly<Record<string, string>>,
): string {
  return steps
    .map((step) => stepText(step.map((id) => roleNames[id] ?? 'a removed role')))
    .join(' → ')
}

/** The send sheet's "Needs approval by Finance, then MD." from the step texts. */
export function needsApprovalLine(stepTexts: readonly string[]): string {
  return `Needs approval by ${stepTexts.join(', then ')}.`
}

/** "Over ₦5,000,000" or "Any amount". */
export function whenText(minAmount: string | null): string {
  return minAmount === null ? 'Any amount' : `Over ${formatAmount(minAmount, 'NGN')}`
}

/** "all companies", "Parkview SPV", "Parkview SPV and Lekki Phase 2 SPV". */
export function companiesText(entityNames: 'all' | readonly string[]): string {
  return entityNames === 'all' ? 'all companies' : joinNames(entityNames)
}

export type PolicyRule = {
  actionKey: ApprovalActionKey
  minAmount: string | null
  /** Each step's text, in order: ["Finance", "MD"]. */
  stepTexts: readonly string[]
  entityNames: 'all' | readonly string[]
}

/**
 * The request's policy line, written from the rule it was made under: "Purchase order over
 * ₦20,000,000 in Parkview SPV needs approval by Finance, then MD."
 */
export function policySentence(rule: PolicyRule): string {
  const label = APPROVAL_ACTIONS[rule.actionKey].label
  const over = rule.minAmount === null ? '' : ` over ${formatAmount(rule.minAmount, 'NGN')}`
  const where = rule.entityNames === 'all' ? '' : ` in ${companiesText(rule.entityNames)}`
  return `${label}${over}${where} needs approval by ${rule.stepTexts.join(', then ')}.`
}

/** "There's already a rule for Purchase order over ₦5,000,000 in all companies." */
export function duplicateRuleMessage(rule: Omit<PolicyRule, 'stepTexts'>): string {
  const label = APPROVAL_ACTIONS[rule.actionKey].label
  const over = rule.minAmount === null ? '' : ` over ${formatAmount(rule.minAmount, 'NGN')}`
  return `There's already a rule for ${label}${over} in ${companiesText(rule.entityNames)}.`
}

/** The amber warning on a rule: "Nobody can approve step 2 in Parkview SPV". */
export function gapText(position: number, entityName: string | null): string {
  return `Nobody can approve step ${position}${entityName ? ` in ${entityName}` : ''}`
}

/** A disabled role in the rule sheet: "Finance can't approve in Projects & construction. …". */
export function cannotApproveInModuleText(roleName: string, module: PermissionModule): string {
  return `${roleName} can't approve in ${MODULE_LABELS[module]}. Give it Approve on its role first.`
}

/** A money action refused before saving: nobody but the maker could approve it. */
export function noApproverMessage(entityName: string | null): string {
  return `Nobody else can approve this${entityName ? ` in ${entityName}` : ''}. Ask an owner to add an approver to the rule.`
}

/**
 * An action that refuses without a rule (decision 0026), with no rule for the record's company:
 * "Clearing an encumbrance needs an approval rule for Lekki Pearl Estates Ltd. Ask an owner to add
 * one in Approval rules."
 */
export function noRuleMessage(actionKey: ApprovalActionKey, entityName: string | null): string {
  const doing = APPROVAL_ACTIONS[actionKey].doing
  return `${doing} needs an approval rule${entityName ? ` for ${entityName}` : ''}. Ask an owner to add one in Approval rules.`
}

/**
 * The rules page's warning for such an action: "No rule covers Parkview SPV. Clearing an
 * encumbrance is refused there until one is added." Without a company, no rule exists at all.
 */
export function uncoveredText(actionKey: ApprovalActionKey, entityName: string | null): string {
  const doing = APPROVAL_ACTIONS[actionKey].doing
  if (entityName === null) return `No rule yet. ${doing} is refused until one is added.`
  return `No rule covers ${entityName}. ${doing} is refused there until one is added.`
}

/** The audit entry's note when a platform action went ahead with nobody else to approve. */
export const NO_APPROVER_NOTE = 'No one else could approve this'

/** A role in a rule can't be deleted: "Site manager approves in 2 rules. Change those rules first." */
export function roleInRuleMessage(roleName: string, ruleCount: number): string {
  if (ruleCount === 1) return `${roleName} approves in 1 rule. Change that rule first.`
  return `${roleName} approves in ${ruleCount} rules. Change those rules first.`
}

/** A stale request: "Site engineer changed after this was asked, so this request has expired." */
export function staleMessage(recordLabel: string): string {
  return `${recordLabel} changed after this was asked, so this request has expired.`
}

/** The loser of a concurrent decision: "Aisha Bello approved this a moment ago." */
export function decidedMomentAgoMessage(name: string, decision: 'approve' | 'reject'): string {
  return `${name} ${decision === 'approve' ? 'approved' : 'rejected'} this a moment ago.`
}

/** "Cancelled because Grace Umeh left". */
export function cancelledForLeaverText(makerName: string): string {
  return `Cancelled because ${makerName} left`
}

/** "Export the audit log": over the cap. */
export function tooManyRowsMessage(count: number): string {
  return `Narrow the dates to export. This view has ${groupDigits(String(count))} entries.`
}

/** Fixed copy from the spec's UI copy table. */
export const APPROVAL_COPY = {
  inboxTitle: 'Approvals',
  inboxSubtitle:
    'Every change above a limit needs a second person. Nobody can approve their own request.',
  rulesTitle: 'Approval rules',
  rulesSubtitle:
    'Which actions need approval, by whom, and above what amount. Changes apply to new requests only.',
  requesterCantApprove: "Requester can't approve, even if their role allows",
  ownersOnly: 'Only owners can change approval rules.',
  reasonRequired: 'Tell the approver why.',
  commentRequired: 'Enter a comment to reject.',
  expired: "This request expired. Ask again if it's still needed.",
  alreadyPending: "There's already a request waiting for this.",
  offline: "You're offline. Approve when you're back online.",
  emailSecurity: 'For your security, approving happens in Vento Real Estate, not from this email.',
  sendTitle: 'Send for approval',
  whyPlaceholder: 'What should the approver know?',
  ruleSaved: 'Rule saved. Applies to new requests.',
  requestCancelled: 'Request cancelled',
  emptyWaiting: 'Nothing waiting for you.',
  emptyMine:
    "You haven't asked for any approvals. When something you do needs a second person, it shows here.",
  emptyDecided: 'Requests you approve or reject show here.',
} as const
