import {
  changeCount,
  isEmptyPermissionSet,
  type PermissionAction,
  type PermissionModule,
  type PermissionSet,
  permissionChanges,
  type Role,
  roleNeedsTwoStep,
  toggleCell,
} from '@vento/shared'
import { useState } from 'react'

export type RoleDraft = {
  name: string
  description: string
  /** What the person chose; the lock can force it on without losing the choice. */
  twoStepChoice: boolean
  permissions: PermissionSet
}

export function draftFrom(role: Role): RoleDraft {
  return {
    name: role.name,
    description: role.description,
    twoStepChoice: role.requiresTwoStep,
    permissions: role.permissions,
  }
}

/** Everything the page derives from a draft against the saved role. Pure, for tests. */
export function draftState(role: Role, draft: RoleDraft) {
  const changes = permissionChanges(role.permissions, draft.permissions)
  // Locked on for a role that can manage money, payroll or people's access (spec question 4), or
  // approve anything (decision 0024).
  const twoStepLocked = roleNeedsTwoStep(draft.permissions)
  const requiresTwoStep = twoStepLocked || draft.twoStepChoice
  const name = draft.name.trim()
  const description = draft.description.trim()
  const extra =
    Number(name !== role.name) +
    Number(description !== role.description) +
    Number(requiresTwoStep !== role.requiresTwoStep)
  const count = changeCount(changes) + extra
  return {
    changes,
    count,
    dirty: count > 0,
    empty: isEmptyPermissionSet(draft.permissions),
    twoStepLocked,
    requiresTwoStep,
    name,
    description,
  }
}

/** Only what changed, for `roles.update` (with the version the page loaded). */
export function updateFrom(role: Role, draft: RoleDraft) {
  const state = draftState(role, draft)
  return {
    id: role.id,
    version: role.version,
    ...(state.name !== role.name ? { name: state.name } : {}),
    ...(state.description !== role.description ? { description: state.description } : {}),
    ...(state.requiresTwoStep !== role.requiresTwoStep
      ? { requiresTwoStep: state.requiresTwoStep }
      : {}),
    ...(state.changes.length > 0 ? { permissions: draft.permissions } : {}),
  }
}

/**
 * The role page's unsaved edits. The page keys this by role version, so a save, an Undo or a
 * Reload starts again from what the server holds.
 */
export function useRoleDraft(role: Role) {
  const [draft, setDraft] = useState(() => draftFrom(role))
  return {
    draft,
    ...draftState(role, draft),
    toggle: (module: PermissionModule, action: PermissionAction, on: boolean) =>
      setDraft((d) => ({ ...d, permissions: toggleCell(d.permissions, module, action, on) })),
    setName: (name: string) => setDraft((d) => ({ ...d, name })),
    setDescription: (description: string) => setDraft((d) => ({ ...d, description })),
    setTwoStep: (twoStepChoice: boolean) => setDraft((d) => ({ ...d, twoStepChoice })),
    discard: () => setDraft(draftFrom(role)),
    /** Undo for Discard: the edits come back as they were. */
    restore: (previous: RoleDraft) => setDraft(previous),
  }
}

export type RoleDraftApi = ReturnType<typeof useRoleDraft>
