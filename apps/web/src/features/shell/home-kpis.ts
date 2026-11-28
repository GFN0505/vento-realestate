import type { PermissionModule, SystemRoleKey } from '@vento/shared'
import type { KpiGlyphName } from './kpi-glyphs'
import { canViewModule, type NavAccess } from './nav'

/*
 * Home's four numbers per role, from the role-home boards (ExecutiveHome, HomeLand, HomePM,
 * HomeSales, HomeFinance, HomeHR, HomeFM). Each belongs to the module that will feed it; until
 * that module ships the tile shows "—" and says which module brings it. A tile shows only where
 * its module's entry does: the organization has it and the role can view it (decision 12).
 */

export type HomeKpi = { label: string; icon: KpiGlyphName; module: PermissionModule }

const EXECUTIVE: readonly HomeKpi[] = [
  { label: 'Cash across companies', icon: 'landmark', module: 'finance' },
  { label: 'Collected this month', icon: 'hand-coins', module: 'finance' },
  { label: 'Overdue', icon: 'calendar-clock', module: 'sales' },
  { label: 'Units sold', icon: 'key-round', module: 'sales' },
]

export const HOME_KPIS: Record<SystemRoleKey, readonly HomeKpi[]> = {
  owner: EXECUTIVE,
  admin: EXECUTIVE,
  viewer: EXECUTIVE,
  land_legal: [
    { label: 'Titles in progress', icon: 'scroll-text', module: 'land' },
    { label: 'Active encumbrances', icon: 'shield-alert', module: 'land' },
    { label: 'Contracts for legal review', icon: 'file-search', module: 'documents' },
    { label: 'Deeds to prepare', icon: 'file-pen', module: 'documents' },
  ],
  project_manager: [
    { label: 'Project progress', icon: 'gauge', module: 'projects' },
    { label: 'On site today', icon: 'hard-hat', module: 'projects' },
    { label: 'POs in approval', icon: 'clipboard-check', module: 'projects' },
    { label: 'Open issues', icon: 'triangle-alert', module: 'projects' },
  ],
  sales: [
    { label: 'My sales this quarter', icon: 'trending-up', module: 'sales' },
    { label: 'Follow-ups due today', icon: 'phone-call', module: 'sales' },
    { label: 'Units I can sell', icon: 'building-2', module: 'sales' },
    { label: 'Commission earned', icon: 'badge-percent', module: 'sales' },
  ],
  finance: [
    { label: 'Cash, all companies', icon: 'landmark', module: 'finance' },
    { label: 'Bank lines to match', icon: 'arrow-left-right', module: 'finance' },
    { label: 'Receipts held for AML', icon: 'shield-alert', module: 'compliance' },
    { label: 'Month-end close', icon: 'calendar-check', module: 'finance' },
  ],
  hr: [
    { label: 'Payroll this month', icon: 'banknote', module: 'hr' },
    { label: 'Leave requests', icon: 'plane', module: 'hr' },
    { label: 'Memberships expiring', icon: 'id-card', module: 'hr' },
    { label: 'On leave today', icon: 'calendar-days', module: 'hr' },
  ],
  facility: [
    { label: 'Open requests', icon: 'wrench', module: 'facility' },
    { label: 'Diesel in tank', icon: 'fuel', module: 'facility' },
    { label: 'Service charge collected', icon: 'receipt', module: 'facility' },
    { label: 'PPM due this week', icon: 'calendar-clock', module: 'facility' },
  ],
}

const TILES = 4

/**
 * The role's four tiles. Any whose module isn't shown are dropped and the row is
 * topped up from the other role sets it can view, so every Home reads the same way: four tiles.
 * Custom roles start from the executive set.
 */
export function homeKpis(access: NavAccess, roleKey: SystemRoleKey | null): HomeKpi[] {
  const own = roleKey ? HOME_KPIS[roleKey] : EXECUTIVE
  const candidates = [own, EXECUTIVE, ...Object.values(HOME_KPIS)].flat()
  const picked: HomeKpi[] = []
  for (const kpi of candidates) {
    if (picked.length === TILES) break
    if (!canViewModule(access, kpi.module)) continue
    if (picked.some((p) => p.label === kpi.label)) continue
    picked.push(kpi)
  }
  return picked
}

/** "Numbers appear as Finance and Sales go live." Module names come from the tiles shown. */
export function kpiNote(kpis: readonly HomeKpi[], labelOf: (m: PermissionModule) => string) {
  const names = [...new Set(kpis.map((k) => labelOf(k.module)))]
  if (names.length === 0) return null
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `Numbers appear as ${list} ${names.length === 1 ? 'goes' : 'go'} live.`
}
