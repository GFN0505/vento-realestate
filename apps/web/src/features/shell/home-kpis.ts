import type { PermissionModule, PermissionSet, SystemRoleKey } from '@vento/shared'
import {
  ArrowLeftRight,
  BadgePercent,
  Banknote,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FilePen,
  FileSearch,
  Fuel,
  Gauge,
  HandCoins,
  HardHat,
  IdCard,
  KeyRound,
  Landmark,
  type LucideIcon,
  PhoneCall,
  Plane,
  Receipt,
  ScrollText,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { can } from '@/lib/permissions'

/*
 * Home's four numbers per role, from the role-home boards (ExecutiveHome, HomeLand, HomePM,
 * HomeSales, HomeFinance, HomeHR, HomeFM). Each belongs to the module that will feed it; until
 * that module ships the tile shows "—" and says which module brings it. Decision 12: a tile
 * whose module the role can't view never shows.
 */

export type HomeKpi = { label: string; icon: LucideIcon; module: PermissionModule }

const EXECUTIVE: readonly HomeKpi[] = [
  { label: 'Cash across entities', icon: Landmark, module: 'finance' },
  { label: 'Collected this month', icon: HandCoins, module: 'finance' },
  { label: 'Overdue', icon: CalendarClock, module: 'sales' },
  { label: 'Units sold', icon: KeyRound, module: 'sales' },
]

export const HOME_KPIS: Record<SystemRoleKey, readonly HomeKpi[]> = {
  owner: EXECUTIVE,
  admin: EXECUTIVE,
  viewer: EXECUTIVE,
  land_legal: [
    { label: 'Titles in progress', icon: ScrollText, module: 'land' },
    { label: 'Active encumbrances', icon: ShieldAlert, module: 'land' },
    { label: 'Contracts for legal review', icon: FileSearch, module: 'documents' },
    { label: 'Deeds to prepare', icon: FilePen, module: 'documents' },
  ],
  project_manager: [
    { label: 'Project progress', icon: Gauge, module: 'projects' },
    { label: 'On site today', icon: HardHat, module: 'projects' },
    { label: 'POs in approval', icon: ClipboardCheck, module: 'projects' },
    { label: 'Open issues', icon: TriangleAlert, module: 'projects' },
  ],
  sales: [
    { label: 'My sales this quarter', icon: TrendingUp, module: 'sales' },
    { label: 'Follow-ups due today', icon: PhoneCall, module: 'sales' },
    { label: 'Units I can sell', icon: Building2, module: 'sales' },
    { label: 'Commission earned', icon: BadgePercent, module: 'sales' },
  ],
  finance: [
    { label: 'Cash, all entities', icon: Landmark, module: 'finance' },
    { label: 'Bank lines to match', icon: ArrowLeftRight, module: 'finance' },
    { label: 'Receipts held for AML', icon: ShieldAlert, module: 'compliance' },
    { label: 'Month-end close', icon: CalendarCheck, module: 'finance' },
  ],
  hr: [
    { label: 'Payroll this month', icon: Banknote, module: 'hr' },
    { label: 'Leave requests', icon: Plane, module: 'hr' },
    { label: 'Memberships expiring', icon: IdCard, module: 'hr' },
    { label: 'On leave today', icon: CalendarDays, module: 'hr' },
  ],
  facility: [
    { label: 'Open requests', icon: Wrench, module: 'facility' },
    { label: 'Diesel in tank', icon: Fuel, module: 'facility' },
    { label: 'Service charge collected', icon: Receipt, module: 'facility' },
    { label: 'PPM due this week', icon: CalendarClock, module: 'facility' },
  ],
}

const TILES = 4

/**
 * The role's four tiles. Any its role can't view are dropped (decision 12) and the row is
 * topped up from the other role sets it can view, so every Home reads the same way: four tiles.
 * Custom roles start from the executive set.
 */
export function homeKpis(
  permissions: PermissionSet | null,
  roleKey: SystemRoleKey | null,
): HomeKpi[] {
  const own = roleKey ? HOME_KPIS[roleKey] : EXECUTIVE
  const candidates = [own, EXECUTIVE, ...Object.values(HOME_KPIS)].flat()
  const picked: HomeKpi[] = []
  for (const kpi of candidates) {
    if (picked.length === TILES) break
    if (!can(permissions, kpi.module, 'view')) continue
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
