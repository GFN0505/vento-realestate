import type { PermissionModule, PermissionSet, SystemRoleKey } from '@vento/shared'
import {
  Building,
  Building2,
  ChartColumn,
  FileText,
  House,
  type LucideIcon,
  MapPin,
  ShieldCheck,
  Tag,
  Users,
  Wallet,
} from 'lucide-react'
import { can } from '@/lib/permissions'
import type { NavPath } from './nav-paths'

export type { NavPath }

/*
 * The one navigation registry (plan 6.2). The sidebar, phone tabs, More sheet, ⌘K and the 403
 * guard all read it, so a module can never show in one place and not another. Decision 12: a
 * module the role can't view appears nowhere; only a typed or pasted link reaches its 403.
 */

export type NavKey =
  | 'home'
  | 'land'
  | 'projects'
  | 'estates'
  | 'sales'
  | 'finance'
  | 'hr'
  | 'compliance'
  | 'documents'
  | 'reports'

type NavGroup = 'overview' | 'land_assets' | 'revenue' | 'people'

/** `soon` shows with a "Soon" tag and a Coming soon page; `hidden` is the one-switch hide. */
export type NavStatus = 'built' | 'soon' | 'hidden'

export type NavItem = {
  key: NavKey
  /** null = Home, which every member sees. */
  module: PermissionModule | null
  label: string
  to: NavPath
  icon: LucideIcon
  group: NavGroup
  status: NavStatus
  /** The Coming soon page's one line (spec UI copy). */
  comingSoon?: string
  /** Extra words ⌘K matches on. */
  keywords: readonly string[]
}

export const NAV: readonly NavItem[] = [
  {
    key: 'home',
    module: null,
    label: 'Home',
    to: '/',
    icon: House,
    group: 'overview',
    status: 'built',
    keywords: ['dashboard', 'start'],
  },
  {
    key: 'land',
    module: 'land',
    label: 'Land & title',
    to: '/land',
    icon: MapPin,
    group: 'land_assets',
    status: 'soon',
    keywords: ['parcels', 'plots', 'c of o', 'consent', 'survey', 'encumbrances'],
    comingSoon:
      "Track parcels from purchase to perfected title: survey plans, C of O, governor's consent and encumbrances.",
  },
  {
    key: 'projects',
    module: 'projects',
    label: 'Projects',
    to: '/projects',
    icon: Building2,
    group: 'land_assets',
    status: 'soon',
    keywords: ['construction', 'phases', 'site', 'diary', 'boq', 'contractors', 'purchase orders'],
    comingSoon: 'Run phases, budgets, BoQs, contractors, purchase orders and the site diary.',
  },
  {
    key: 'estates',
    module: 'facility',
    label: 'Estates',
    to: '/estates',
    icon: Building,
    group: 'land_assets',
    status: 'soon',
    keywords: ['facility', 'service charge', 'maintenance', 'residents'],
    comingSoon: 'Manage handed-over estates: service charge, utilities and maintenance.',
  },
  {
    key: 'sales',
    module: 'sales',
    label: 'Sales',
    to: '/sales',
    icon: Tag,
    group: 'revenue',
    status: 'soon',
    keywords: ['leads', 'buyers', 'units', 'subscriptions', 'payment plans', 'commissions', 'crm'],
    comingSoon: 'Sell off-plan: leads, units, subscriptions, payment plans and commissions.',
  },
  {
    key: 'finance',
    module: 'finance',
    label: 'Finance',
    to: '/finance',
    icon: Wallet,
    group: 'revenue',
    status: 'soon',
    keywords: ['receipts', 'ledger', 'fx', 'tax', 'vat', 'wht', 'banks'],
    comingSoon: 'Receipts, ledgers per entity, FX, construction finance and tax.',
  },
  {
    key: 'hr',
    module: 'hr',
    label: 'HR & payroll',
    to: '/hr',
    icon: Users,
    group: 'people',
    status: 'soon',
    keywords: ['staff', 'payroll', 'paye', 'pension', 'nhf', 'leave'],
    comingSoon: 'Staff, site workers and payroll with PAYE, pension and NHF.',
  },
  {
    key: 'compliance',
    module: 'compliance',
    label: 'Compliance',
    to: '/compliance',
    icon: ShieldCheck,
    group: 'people',
    status: 'soon',
    keywords: ['permits', 'kyc', 'aml', 'ubo', 'scuml'],
    comingSoon: 'Permits, buyer KYC, AML reviews and the UBO register.',
  },
  {
    key: 'documents',
    module: 'documents',
    label: 'Documents',
    to: '/documents',
    icon: FileText,
    group: 'people',
    status: 'soon',
    keywords: ['contracts', 'letters', 'templates', 'e-signature', 'offer', 'allocation'],
    comingSoon: 'Contracts and letters from templates, with approvals and e-signature.',
  },
  {
    key: 'reports',
    module: 'analytics',
    label: 'Reports',
    to: '/reports',
    icon: ChartColumn,
    group: 'people',
    status: 'soon',
    keywords: ['analytics', 'dashboards', 'board pack', 'returns'],
    comingSoon: 'Dashboards, project returns and board packs.',
  },
]

const GROUP_HEADINGS: Record<NavGroup, string> = {
  overview: 'Overview',
  land_assets: 'Land & assets',
  revenue: 'Revenue',
  people: 'People & governance',
}

/** Longer lists get group headings; six or fewer sit under one "Workspace" heading. */
const GROUPED_ABOVE = 6

/** Spec table "Mobile tabs": the modules after Home, in priority order, per built-in role. */
export const MOBILE_TAB_PRIORITY: Record<SystemRoleKey, readonly NavKey[]> = {
  owner: ['projects', 'sales', 'reports'],
  admin: ['projects', 'sales', 'reports'],
  land_legal: ['land', 'documents', 'compliance'],
  project_manager: ['projects', 'documents', 'compliance'],
  sales: ['sales', 'documents', 'compliance'],
  finance: ['finance', 'sales', 'reports'],
  hr: ['hr', 'documents'],
  facility: ['estates', 'projects', 'documents'],
  viewer: ['projects', 'sales', 'reports'],
}

const MAX_MODULE_TABS = 3

export function canView(permissions: PermissionSet | null, item: NavItem): boolean {
  if (item.status === 'hidden') return false
  if (item.module === null) return true
  return can(permissions, item.module, 'view')
}

/** Home plus every module the role can view, in sidebar order. */
export function visibleNav(permissions: PermissionSet | null): NavItem[] {
  return NAV.filter((item) => canView(permissions, item))
}

export function sidebarSections(
  permissions: PermissionSet | null,
): { heading: string; items: NavItem[] }[] {
  const items = visibleNav(permissions)
  if (items.length <= GROUPED_ABOVE) return [{ heading: 'Workspace', items }]
  const groups = Object.keys(GROUP_HEADINGS) as NavGroup[]
  return groups
    .map((group) => ({
      heading: GROUP_HEADINGS[group],
      items: items.filter((i) => i.group === group),
    }))
    .filter((section) => section.items.length > 0)
}

/** Home plus up to three modules; custom roles get their first three in sidebar order. */
export function mobileTabs(
  permissions: PermissionSet | null,
  roleKey: SystemRoleKey | null,
): NavItem[] {
  const viewable = visibleNav(permissions)
  const modules = viewable.filter((item) => item.module !== null)
  const priority = roleKey ? MOBILE_TAB_PRIORITY[roleKey] : null
  const picked = priority
    ? priority.flatMap((key) => modules.filter((item) => item.key === key))
    : modules
  const home = viewable.filter((item) => item.module === null)
  return [...home, ...picked.slice(0, MAX_MODULE_TABS)]
}

/** The role's modules that didn't fit in the tabs, for the More sheet. */
export function moreItems(
  permissions: PermissionSet | null,
  roleKey: SystemRoleKey | null,
): NavItem[] {
  const tabs = new Set(mobileTabs(permissions, roleKey).map((item) => item.key))
  return visibleNav(permissions).filter((item) => !tabs.has(item.key))
}

export function navItemForModule(module: PermissionModule): NavItem | undefined {
  return NAV.find((item) => item.module === module)
}

export function navItem(key: NavKey): NavItem {
  const item = NAV.find((i) => i.key === key)
  if (!item) throw new Error(`Unknown nav key ${key}`)
  return item
}
