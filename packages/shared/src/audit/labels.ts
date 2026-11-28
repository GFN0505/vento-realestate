import {
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionAction,
} from '../access/permissions'
import { MONTHS } from '../common/nigeria'
import { AUDIT_ACTIONS, type AuditAction } from './actions'
import { landWhat } from './land-labels'

// The audit log in plain words (spec: no codes, ids or JSON). Every action needs an entry here;
// the labels test fails otherwise, so a new AUDIT_ACTIONS value can't ship unlabelled.

/** The audit log's Module filter: a permission module, or the person's own account events. */
export const AUDIT_MODULES = [...PERMISSION_MODULES, 'account'] as const
export type AuditModule = (typeof AUDIT_MODULES)[number]

export const AUDIT_MODULE_LABELS: Record<AuditModule, string> = {
  ...MODULE_LABELS,
  account: 'Sign-in & security',
}

/** What `what` may read from a stored event. Never before/after: those are field changes. */
export type AuditEventForLabel = {
  targetLabel: string | null
  metadata: Readonly<Record<string, unknown>> | null
}

export type AuditActionMeta = {
  module: AuditModule
  /** Static words for search and the CSV: "Changed a role". */
  name: string
  /** The row's What, with the record: "Changed role Site engineer". */
  what: (e: AuditEventForLabel) => string
}

const named =
  (prefix: string, fallback: string) =>
  (e: AuditEventForLabel): string =>
    e.targetLabel ? `${prefix} ${e.targetLabel}` : fallback

const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`)

const text = (meta: AuditEventForLabel['metadata'], key: string): string | null => {
  const v = meta?.[key]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

const count = (meta: AuditEventForLabel['metadata'], key: string): number | null => {
  const v = meta?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Vento Real Estate's own changes store their plain-words sentence in `metadata.message`. */
const ventoNotice =
  (fallback: string) =>
  (e: AuditEventForLabel): string =>
    text(e.metadata, 'message') ?? fallback

const s = (module: AuditModule, name: string, what?: AuditActionMeta['what']): AuditActionMeta => ({
  module,
  name,
  what: what ?? (() => name),
})

export const AUDIT_ACTION_META: Readonly<Record<AuditAction, AuditActionMeta>> = {
  'organization.created': s(
    'settings',
    'Created the organization',
    named('Created', 'Created the organization'),
  ),
  'organization.updated': s(
    'settings',
    'Changed the organization',
    named('Changed', 'Changed the organization'),
  ),
  // Decision 0018: people say "company", the code says "entity".
  'entity.created': s('settings', 'Added a company', named('Added company', 'Added a company')),
  'entity.updated': s(
    'settings',
    'Changed a company',
    named('Changed company', 'Changed a company'),
  ),
  'entity.archived': s(
    'settings',
    'Archived a company',
    named('Archived company', 'Archived a company'),
  ),
  'entity.restored': s(
    'settings',
    'Restored a company',
    named('Restored company', 'Restored a company'),
  ),
  'role.created': s('settings', 'Created a role', named('Created role', 'Created a role')),
  'role.updated': s('settings', 'Changed a role', named('Changed role', 'Changed a role')),
  'role.deleted': s('settings', 'Deleted a role', named('Deleted role', 'Deleted a role')),
  'invitation.sent': s('settings', 'Invited someone', named('Invited', 'Invited someone')),
  'invitation.resent': s(
    'settings',
    'Resent an invitation',
    named('Resent the invitation to', 'Resent an invitation'),
  ),
  'invitation.withdrawn': s(
    'settings',
    'Withdrew an invitation',
    named('Withdrew the invitation to', 'Withdrew an invitation'),
  ),
  'invitation.accepted': s('settings', 'Joined from an invitation'),
  'invitation.declined': s('settings', 'Declined an invitation'),
  'member.access_changed': s('settings', "Changed someone's role or companies", (e) =>
    e.targetLabel
      ? `Changed ${possessive(e.targetLabel)} role or companies`
      : "Changed someone's role or companies",
  ),
  'member.removed': s('settings', 'Removed someone', named('Removed', 'Removed someone')),
  'two_step.enabled': s('account', 'Turned on two-step sign-in'),
  'two_step.disabled': s('account', 'Turned off two-step sign-in'),
  'two_step.reset': s('account', "Reset someone's two-step sign-in", (e) =>
    e.targetLabel
      ? `Reset ${possessive(e.targetLabel)} two-step sign-in`
      : "Reset someone's two-step sign-in",
  ),
  'two_step.backup_codes_regenerated': s('account', 'Made new backup codes'),
  'two_step.backup_code_used': s('account', 'Signed in with a backup code'),
  'account.password_changed': s('account', 'Changed their password'),
  'account.password_reset': s('account', 'Reset their password'),
  'auth.signed_in': s('account', 'Signed in'),
  'auth.sign_in_failed': s('account', 'Entered a wrong password'),
  'auth.two_step_failed': s('account', 'Entered a wrong two-step code'),
  'auth.locked_out': s('account', 'Locked out after too many tries'),
  'session.revoked': s(
    'account',
    'Signed out a device',
    named('Signed out', 'Signed out a device'),
  ),
  'session.revoked_others': s('account', 'Signed out everywhere else'),
  'session.revoked_by_removal': s('account', 'Signed out on removal', (e) =>
    e.targetLabel ? `Signed ${e.targetLabel} out on removal` : 'Signed out on removal',
  ),
  'passkey.added': s('account', 'Added a passkey', named('Added passkey', 'Added a passkey')),
  'passkey.renamed': s(
    'account',
    'Renamed a passkey',
    named('Renamed a passkey to', 'Renamed a passkey'),
  ),
  'passkey.removed': s(
    'account',
    'Removed a passkey',
    named('Removed passkey', 'Removed a passkey'),
  ),
  'passkey.suspected_clone': s('account', 'A passkey may have been copied', (e) =>
    e.targetLabel
      ? `Passkey ${e.targetLabel} may have been copied`
      : 'A passkey may have been copied',
  ),
  'account.name_changed': s('account', 'Changed their name'),
  'plan.assigned': s('settings', 'Changed the plan', ventoNotice('Changed the plan')),
  'plan.trial_started': s('settings', 'Started a trial', ventoNotice('Started a trial')),
  'plan.trial_ended': s('settings', 'The trial ended', ventoNotice('The trial ended')),
  'plan.trial_cancelled': s('settings', 'Ended the trial', ventoNotice('Ended the trial')),
  'plan.add_on_added': s('settings', 'Added an add-on', ventoNotice('Added an add-on')),
  'plan.add_on_removed': s('settings', 'Removed an add-on', ventoNotice('Removed an add-on')),
  'plan.add_on_changed': s('settings', 'Changed an add-on', ventoNotice('Changed an add-on')),
  'plan.feature_overridden': s('settings', 'Changed a feature', ventoNotice('Changed a feature')),
  'plan.limit_overridden': s('settings', 'Changed a limit', ventoNotice('Changed a limit')),
  'plan.override_cleared': s(
    'settings',
    'Cleared a plan change',
    ventoNotice('Cleared a plan change'),
  ),
  'release.group_changed': s(
    'settings',
    'Changed early access',
    ventoNotice('Changed early access'),
  ),
  'release.override_set': s(
    'settings',
    'Turned a feature on or off',
    ventoNotice('Turned a feature on or off'),
  ),
  'release.override_cleared': s(
    'settings',
    'Cleared a feature setting',
    ventoNotice('Cleared a feature setting'),
  ),
  'console.opened': s('account', 'Opened the Vento Real Estate console'),
  // Approval events are filed under Settings until money modules plug in; each carries
  // `metadata.module`, so the filter can widen to it without a backfill.
  'approval.requested': s(
    'settings',
    'Asked for approval',
    named('Asked for approval:', 'Asked for approval'),
  ),
  'approval.step_approved': s('settings', 'Approved a step', (e) => {
    const step = count(e.metadata, 'position')
    const which = step === null ? 'a step' : `step ${step}`
    return e.targetLabel ? `Approved ${which}: ${e.targetLabel}` : `Approved ${which}`
  }),
  'approval.approved': s('settings', 'Approved a request', named('Approved', 'Approved a request')),
  'approval.rejected': s('settings', 'Rejected a request', named('Rejected', 'Rejected a request')),
  'approval.cancelled': s(
    'settings',
    'Cancelled a request',
    named('Cancelled the request:', 'Cancelled a request'),
  ),
  'approval.expired': s('settings', 'A request expired', (e) =>
    e.targetLabel ? `Request expired: ${e.targetLabel}` : 'A request expired',
  ),
  'approval_rule.created': s(
    'settings',
    'Added an approval rule',
    named('Added approval rule:', 'Added an approval rule'),
  ),
  'approval_rule.updated': s(
    'settings',
    'Changed an approval rule',
    named('Changed approval rule:', 'Changed an approval rule'),
  ),
  'approval_rule.deleted': s(
    'settings',
    'Deleted an approval rule',
    named('Deleted approval rule:', 'Deleted an approval rule'),
  ),
  'audit.exported': s('settings', 'Exported the audit log', (e) => {
    const n = count(e.metadata, 'count')
    return n === null
      ? 'Exported the audit log'
      : `Exported the audit log · ${n.toLocaleString('en-NG')} ${n === 1 ? 'entry' : 'entries'}`
  }),
  'land.parcel.created': s('land', 'Added a parcel', landWhat.parcelCreated),
  'land.parcel.updated': s('land', 'Changed a parcel', landWhat.parcelUpdated),
  'land.parcel.archived': s(
    'land',
    'Archived a parcel',
    named('Archived parcel', 'Archived the parcel'),
  ),
  'land.parcel.restored': s(
    'land',
    'Restored a parcel',
    named('Restored parcel', 'Restored the parcel'),
  ),
  'land.title_stage.updated': s('land', 'Updated a title stage', landWhat.stageUpdated),
  'land.title_stages.changed': s('land', 'Changed the title stages', landWhat.stagesChanged),
  'land.document.uploaded': s('land', 'Uploaded a title document', landWhat.documentUploaded),
  'land.document.removed': s('land', 'Removed a title document version', landWhat.documentRemoved),
  'land.document.restored': s(
    'land',
    'Restored a title document version',
    landWhat.documentRestored,
  ),
  'land.document.link_issued': s('land', 'Opened a title document', landWhat.linkIssued),
}

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value)
}

/**
 * The row's What. Stored actions are text, so one from a later release (or a rolled-back one)
 * still reads as words, never as its code.
 */
export function auditWhat(action: string, e: AuditEventForLabel): string {
  return isAuditAction(action) ? AUDIT_ACTION_META[action].what(e) : 'Made a change'
}

export function auditModuleOf(action: string): AuditModule | null {
  return isAuditAction(action) ? AUDIT_ACTION_META[action].module : null
}

/** The actions the Module filter matches. */
export function auditActionsInModule(module: AuditModule): AuditAction[] {
  return AUDIT_ACTIONS.filter((a) => AUDIT_ACTION_META[a].module === module)
}

/** Search: actions whose words contain `q` ("role" → every role and member-role action). */
export function auditActionsMatching(q: string): AuditAction[] {
  const needle = q.trim().toLowerCase()
  if (needle === '') return []
  return AUDIT_ACTIONS.filter((a) => AUDIT_ACTION_META[a].name.toLowerCase().includes(needle))
}

// ---------------------------------------------------------------------------------------------
// Field changes (before → after)

/** Labels for stored before/after keys. Anything else reads "Other details changed". */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  description: 'Description',
  requiresTwoStep: 'Two-step required',
  role: 'Role',
  entities: 'Companies',
  status: 'Status',
  email: 'Email',
  expiresAt: 'Expires',
  source: 'Copied from',
  headOfficeState: 'Head office state',
  financialYearStartMonth: 'Financial year starts',
  singleCompanyConfirmed: 'Only one company',
  twoStepRequiredForEveryone: 'Two-step required for everyone',
  type: 'Type',
  rcNumber: 'RC number',
  tin: 'TIN',
  vatRegistered: 'VAT registered',
  plan: 'Plan',
  endsOn: 'Ends on',
  addOn: 'Add-on',
  budget: 'Monthly budget',
  releaseGroup: 'Early access group',
  // Approval rules, stored as words (plan §6.4).
  action: 'Action',
  when: 'When',
  approvedBy: 'Approved by',
  companies: 'Companies',
  // Land & title (stored as words: company names, stage labels, sizes like "4.20 ha").
  state: 'State',
  lga: 'LGA',
  area: 'Area or town',
  size: 'Size',
  company: 'Company',
  acquiredOn: 'Acquisition date',
  acquisitionCost: 'Acquisition cost',
  seller: 'Bought from',
  notes: 'Notes',
  statusOn: 'Date',
  reference: 'Reference',
  issuedBy: 'Issued by',
  note: 'What happened',
  followUpOn: 'Follow up by',
  stages: 'Title stages',
  number: 'Number',
  issuedOn: 'Issue date',
}

export const OTHER_DETAILS_CHANGED = 'Other details changed'

/** Who did an account event, when they aren't a member of the organization reading it. */
export const OTHER_ORGANIZATION_ACTOR = 'An admin in another organization'

export type AuditFieldChange = { label: string; before: string | null; after: string | null }

type Json = Readonly<Record<string, unknown>> | null | undefined

const ACTION_WORDS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
}

/**
 * Before → after, field by field, in plain words. Permissions expand to one row per module
 * ("Projects & construction: View → View, Approve"); keys without a label, or values that aren't
 * plain, collapse into one "Other details changed" row so raw JSON never reaches anyone.
 */
export function auditFieldChanges(before: Json, after: Json): AuditFieldChange[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  const rows: AuditFieldChange[] = []
  let other = false
  for (const key of keys) {
    const was = before?.[key]
    const now = after?.[key]
    if (key === 'permissions') {
      const expanded = permissionRows(was, now)
      if (expanded) rows.push(...expanded)
      else other = true
      continue
    }
    const label = FIELD_LABELS[key]
    const b = formatValue(key, was)
    const a = formatValue(key, now)
    if (!label || b === UNREADABLE || a === UNREADABLE) other = true
    else rows.push({ label, before: b, after: a })
  }
  if (other) rows.push({ label: OTHER_DETAILS_CHANGED, before: null, after: null })
  return rows
}

const UNREADABLE = Symbol('unreadable')

function formatValue(key: string, value: unknown): string | null | typeof UNREADABLE {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key === 'financialYearStartMonth' && typeof value === 'number') {
    return MONTHS[value - 1] ?? String(value)
  }
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string' && key === 'acquisitionCost') return nairaText(value)
  if (typeof value === 'string' && DATE_KEYS.has(key)) return dateText(value)
  if (typeof value === 'string') {
    if (key === 'entities' && value === 'all') return 'All companies'
    if (key === 'status' || key === 'type' || key === 'releaseGroup') return humanise(value)
    return value
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value.length === 0 ? 'None' : value.join(', ')
  }
  return UNREADABLE
}

const DATE_KEYS = new Set(['acquiredOn', 'statusOn', 'followUpOn', 'issuedOn'])

/** "840000000.00" → "₦840,000,000.00". */
function nairaText(amount: string): string {
  const [whole = '', fraction] = amount.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `₦${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}

const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3))

/** "2025-09-02" → "2 Sep 2025"; anything else as it is. */
function dateText(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  return `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

function humanise(code: string): string {
  const words = code.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function isActionList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((a) => typeof a === 'string')
}

function asRecord(v: unknown): Readonly<Record<string, unknown>> | null {
  if (v === undefined || v === null) return {}
  return typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function permissionRows(was: unknown, now: unknown): AuditFieldChange[] | null {
  const b = asRecord(was)
  const a = asRecord(now)
  if (!b || !a) return null
  const rows: AuditFieldChange[] = []
  for (const module of PERMISSION_MODULES) {
    if (!(module in b) && !(module in a)) continue
    const before = b[module] ?? []
    const after = a[module] ?? []
    if (!isActionList(before) || !isActionList(after)) return null
    rows.push({
      label: MODULE_LABELS[module],
      before: actionsText(before),
      after: actionsText(after),
    })
  }
  return rows
}

function actionsText(actions: readonly string[]): string {
  const known = PERMISSION_ACTIONS.filter((a) => actions.includes(a))
  return known.length === 0 ? 'No access' : known.map((a) => ACTION_WORDS[a]).join(', ')
}
