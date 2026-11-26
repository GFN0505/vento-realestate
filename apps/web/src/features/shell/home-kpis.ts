import type { PermissionModule, PermissionSet, SystemRoleKey } from '@vento/shared'
import { can } from '@/lib/permissions'

/*
 * Home's four numbers per role, from the role-home boards (ExecutiveHome, HomeLand, HomePM,
 * HomeSales, HomeFinance, HomeHR, HomeFM). Each belongs to the module that will feed it; until
 * that module ships the tile shows "—" and says which module brings it. Decision 12: a tile
 * whose module the role can't view never shows.
 */

export type HomeKpi = { label: string; module: PermissionModule }

const EXECUTIVE: readonly HomeKpi[] = [
  { label: 'Cash across entities', module: 'finance' },
  { label: 'Collected this month', module: 'finance' },
  { label: 'Overdue', module: 'sales' },
  { label: 'Units sold', module: 'sales' },
]

export const HOME_KPIS: Record<SystemRoleKey, readonly HomeKpi[]> = {
  owner: EXECUTIVE,
  admin: EXECUTIVE,
  viewer: EXECUTIVE,
  land_legal: [
    { label: 'Titles in progress', module: 'land' },
    { label: 'Active encumbrances', module: 'land' },
    { label: 'Contracts for legal review', module: 'documents' },
    { label: 'Deeds to prepare', module: 'documents' },
  ],
  project_manager: [
    { label: 'Project progress', module: 'projects' },
    { label: 'On site today', module: 'projects' },
    { label: 'POs in approval', module: 'projects' },
    { label: 'Open issues', module: 'projects' },
  ],
  sales: [
    { label: 'My sales this quarter', module: 'sales' },
    { label: 'Follow-ups due today', module: 'sales' },
    { label: 'Units I can sell', module: 'sales' },
    { label: 'Commission earned', module: 'sales' },
  ],
  finance: [
    { label: 'Cash, all entities', module: 'finance' },
    { label: 'Bank lines to match', module: 'finance' },
    { label: 'Receipts held for AML', module: 'compliance' },
    { label: 'Month-end close', module: 'finance' },
  ],
  hr: [
    { label: 'Payroll this month', module: 'hr' },
    { label: 'Leave requests', module: 'hr' },
    { label: 'Memberships expiring', module: 'hr' },
    { label: 'On leave today', module: 'hr' },
  ],
  facility: [
    { label: 'Open requests', module: 'facility' },
    { label: 'Diesel in tank', module: 'facility' },
    { label: 'Service charge collected', module: 'facility' },
    { label: 'PPM due this week', module: 'facility' },
  ],
}

/** The role's tiles it can view. Custom roles get the executive set, filtered the same way. */
export function homeKpis(
  permissions: PermissionSet | null,
  roleKey: SystemRoleKey | null,
): HomeKpi[] {
  const set = roleKey ? HOME_KPIS[roleKey] : EXECUTIVE
  return set.filter((kpi) => can(permissions, kpi.module, 'view'))
}
