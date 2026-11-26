import type { NavAccess } from '@/features/shell/nav'
import { orpc } from '@/lib/orpc'
import { can } from '@/lib/permissions'

/** The viewer's setup checklist (Home). Organization-wide, so it ignores the chosen entity. */
export function checklistQuery() {
  return orpc.checklist.get.queryOptions({ staleTime: 60_000 })
}

/**
 * Who sees Finish setting up: people who can invite (settings create; owners and admins). It
 * follows the effective role, so an owner previewing Sales sees none, as Sales would.
 */
export function canSeeChecklist(access: Pick<NavAccess, 'permissions'>): boolean {
  return can(access.permissions, 'settings', 'create')
}
