import type { PermissionAction, PermissionModule, PermissionSet } from '@vento/shared'

/** What each module covers, in one muted line under its name (spec "Module lines"). */
export const MODULE_LINES: Record<PermissionModule, string> = {
  land: 'Parcels, titles, encumbrances',
  projects: 'Projects, budgets, site diary, purchase orders',
  sales: 'Buyers, units, subscriptions, payment plans',
  finance: 'Receipts, ledger, bills, tax',
  facility: 'Estates, residents, service charge',
  hr: 'Staff, payroll, leave',
  compliance: 'KYC, AML, permits',
  documents: 'Letters, contracts, templates',
  analytics: 'Dashboards and reports',
  settings: 'Organization, companies, team, roles',
}

/** What Settings' actions mean, since they aren't obvious (spec). */
export const SETTINGS_ACTIONS_LINE =
  'Create: invite people, add companies · Edit: change access, roles and the organization · Delete: remove people, archive companies, delete roles'

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
}

/** A line under each action on phones, where there's no header tooltip. */
export const ACTION_HINTS: Partial<Record<PermissionAction, string>> = {
  approve: "Can approve other people's sensitive actions, such as reversing a receipt.",
}

export const APPROVE_TOOLTIP = ACTION_HINTS.approve ?? ''

/** "View · create · edit · export", or "No access" (board PermissionsMobile). */
export function actionsInWords(set: PermissionSet, module: PermissionModule): string {
  const actions = set[module] ?? []
  if (actions.length === 0) return 'No access'
  const words = actions.map((a) => ACTION_LABELS[a].toLowerCase()).join(' · ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
