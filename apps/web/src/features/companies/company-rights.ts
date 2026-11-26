import { ENTITY_TYPE_LABELS, type EntityType, type Me, type PermissionSet } from '@vento/shared'
import { orgWideRefusal } from '@/features/settings/org-wide-access'
import { can } from '@/lib/permissions'

export type CompanyRights = {
  /** Add company (page, switcher, Home, ⌘K). */
  add: boolean
  /** Fix a company's details: any company within the viewer's access. */
  edit: boolean
  /** Archive and restore: organization-wide, so all-companies access too. */
  archive: boolean
}

/**
 * What the screen offers; the server decides (spec "Permissions"). Follows the previewed role,
 * so an admin previewing Sales sees none of it.
 */
export function companyRights(me: Me, permissions: PermissionSet | null): CompanyRights {
  return {
    add: me.canAddCompany && can(permissions, 'settings', 'create'),
    edit: can(permissions, 'settings', 'edit'),
    archive: orgWideRefusal(me, permissions, 'delete') === null,
  }
}

/** "RC 1789234" stays; a missing code reads "Not added". */
export const NOT_ADDED = 'Not added'

/** "Holding company" or "Project company (SPV)". */
export function companyTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_LABELS[type]
}
