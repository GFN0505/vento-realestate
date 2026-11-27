import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionModule,
  type PermissionSet,
} from './permissions'

// Pure rules for custom roles, shared by the permissions grid and the server so they can't
// drift. Constants and types only: the web must not pull zod schemas in through this file.

/** A guard, not a plan limit: past this a roles list stops being readable. */
export const MAX_CUSTOM_ROLES = 50
export const ROLE_NAME_MAX = 40

export type PermissionCell = { module: PermissionModule; action: PermissionAction }
export type ModuleChange = {
  module: PermissionModule
  added: PermissionAction[]
  removed: PermissionAction[]
}

/** Any action implies view; actions in PERMISSION_ACTIONS order; no duplicates; every module present. */
export function normalisePermissions(set: Partial<PermissionSet>): PermissionSet {
  const entries = PERMISSION_MODULES.map((m) => {
    const given = new Set(set[m] ?? [])
    if (given.size > 0) given.add('view')
    return [m, PERMISSION_ACTIONS.filter((a) => given.has(a))]
  })
  return Object.fromEntries(entries) as PermissionSet
}

export function isEmptyPermissionSet(set: Partial<PermissionSet>): boolean {
  return PERMISSION_MODULES.every((m) => (set[m] ?? []).length === 0)
}

/** Grid rules: ticking any action adds view; unticking view clears the module. */
export function toggleCell(
  set: PermissionSet,
  module: PermissionModule,
  action: PermissionAction,
  on: boolean,
): PermissionSet {
  const current = new Set(set[module])
  if (on) {
    current.add(action)
    current.add('view')
  } else if (action === 'view') {
    current.clear()
  } else {
    current.delete(action)
  }
  return { ...set, [module]: PERMISSION_ACTIONS.filter((a) => current.has(a)) }
}

/** The (module, action) pairs in `target` that `granter` lacks. Empty = within the ceiling. */
export function permissionsBeyond(granter: PermissionSet, target: PermissionSet): PermissionCell[] {
  const beyond: PermissionCell[] = []
  for (const module of PERMISSION_MODULES) {
    const has = granter[module] ?? []
    for (const action of target[module] ?? []) {
      if (!has.includes(action)) beyond.push({ module, action })
    }
  }
  return beyond
}

export function withinPermissions(granter: PermissionSet, target: PermissionSet): boolean {
  return permissionsBeyond(granter, target).length === 0
}

const SETTINGS_CHANGES: readonly PermissionAction[] = ['create', 'edit', 'delete']

/**
 * Two-step is required for a role that can change settings (people's access), do more than
 * view in Finance or HR (money and payroll), or approve anything (decision 0024: approvers are
 * the second person, so their sign-in must be strong). Matches every built-in role (tested).
 */
export function roleNeedsTwoStep(set: PermissionSet): boolean {
  if ((set.settings ?? []).some((a) => SETTINGS_CHANGES.includes(a))) return true
  if (PERMISSION_MODULES.some((m) => (set[m] ?? []).includes('approve'))) return true
  return (['finance', 'hr'] as const).some((m) => (set[m] ?? []).some((a) => a !== 'view'))
}

/** Per module, actions added and removed: the audit before → after, and the save bar's "3 changes". */
export function permissionChanges(before: PermissionSet, after: PermissionSet): ModuleChange[] {
  const changes: ModuleChange[] = []
  for (const module of PERMISSION_MODULES) {
    const was = before[module] ?? []
    const now = after[module] ?? []
    const added = PERMISSION_ACTIONS.filter((a) => now.includes(a) && !was.includes(a))
    const removed = PERMISSION_ACTIONS.filter((a) => was.includes(a) && !now.includes(a))
    if (added.length > 0 || removed.length > 0) changes.push({ module, added, removed })
  }
  return changes
}

export function changeCount(changes: readonly ModuleChange[]): number {
  return changes.reduce((sum, c) => sum + c.added.length + c.removed.length, 0)
}

/** For "Only … can ___" refusals naming a custom role's holders. */
export function customRolePluralName(name: string): string {
  return `people with the ${name} role`
}
