import type { PermissionModule, PermissionSet, SystemRoleKey } from '@vento/shared'
import {
  Building,
  Building2,
  ChartColumn,
  FileText,
  House,
  LifeBuoy,
  type LucideIcon,
  MapPin,
  Settings,
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
  | 'settings'
  | 'help'

/** `footer` items sit at the bottom of the sidebar (Settings, Help); `main` is Home and modules. */
type NavGroup = 'main' | 'footer'

/** `soon` is a quieter sidebar entry and a Coming soon page; `hidden` is the one-switch hide. */
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
  /** A few words for Home's workspace grid. */
  summary?: string
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
    group: 'main',
    status: 'built',
    keywords: ['dashboard', 'start'],
  },
  {
    key: 'land',
    module: 'land',
    label: 'Land & title',
    to: '/land',
    summary: 'Parcels, titles and encumbrances',
    icon: MapPin,
    group: 'main',
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
    summary: 'Phases, budgets and the site diary',
    icon: Building2,
    group: 'main',
    status: 'soon',
    keywords: ['construction', 'phases', 'site', 'diary', 'boq', 'contractors', 'purchase orders'],
    comingSoon: 'Run phases, budgets, BoQs, contractors, purchase orders and the site diary.',
  },
  {
    key: 'estates',
    module: 'facility',
    label: 'Estates',
    to: '/estates',
    summary: 'Service charge and maintenance',
    icon: Building,
    group: 'main',
    status: 'soon',
    keywords: ['facility', 'service charge', 'maintenance', 'residents'],
    comingSoon: 'Manage handed-over estates: service charge, utilities and maintenance.',
  },
  {
    key: 'sales',
    module: 'sales',
    label: 'Sales',
    to: '/sales',
    summary: 'Leads, units and subscriptions',
    icon: Tag,
    group: 'main',
    status: 'soon',
    keywords: ['leads', 'buyers', 'units', 'subscriptions', 'payment plans', 'commissions', 'crm'],
    comingSoon: 'Sell off-plan: leads, units, subscriptions, payment plans and commissions.',
  },
  {
    key: 'finance',
    module: 'finance',
    label: 'Finance',
    to: '/finance',
    summary: 'Receipts, ledgers and tax',
    icon: Wallet,
    group: 'main',
    status: 'soon',
    keywords: ['receipts', 'ledger', 'fx', 'tax', 'vat', 'wht', 'banks'],
    comingSoon: 'Receipts, ledgers per entity, FX, construction finance and tax.',
  },
  {
    key: 'hr',
    module: 'hr',
    label: 'HR & payroll',
    to: '/hr',
    summary: 'Staff and payroll',
    icon: Users,
    group: 'main',
    status: 'soon',
    keywords: ['staff', 'payroll', 'paye', 'pension', 'nhf', 'leave'],
    comingSoon: 'Staff, site workers and payroll with PAYE, pension and NHF.',
  },
  {
    key: 'compliance',
    module: 'compliance',
    label: 'Compliance',
    to: '/compliance',
    summary: 'Permits, buyer KYC and AML',
    icon: ShieldCheck,
    group: 'main',
    status: 'soon',
    keywords: ['permits', 'kyc', 'aml', 'ubo', 'scuml'],
    comingSoon: 'Permits, buyer KYC, AML reviews and the UBO register.',
  },
  {
    key: 'documents',
    module: 'documents',
    label: 'Documents',
    to: '/documents',
    summary: 'Contracts and letters',
    icon: FileText,
    group: 'main',
    status: 'soon',
    keywords: ['contracts', 'letters', 'templates', 'e-signature', 'offer', 'allocation'],
    comingSoon: 'Contracts and letters from templates, with approvals and e-signature.',
  },
  {
    key: 'reports',
    module: 'analytics',
    label: 'Reports',
    to: '/reports',
    summary: 'Dashboards and board packs',
    icon: ChartColumn,
    group: 'main',
    status: 'soon',
    keywords: ['analytics', 'dashboards', 'board pack', 'returns'],
    comingSoon: 'Dashboards, project returns and board packs.',
  },
  {
    // Hidden until Team settings (3b) give it something real to open; then 'soon' or 'built'.
    key: 'settings',
    module: 'settings',
    label: 'Settings',
    to: '/settings',
    icon: Settings,
    group: 'footer',
    status: 'hidden',
    keywords: ['team', 'members', 'roles', 'permissions', 'entities', 'organization', 'security'],
    comingSoon: 'Your team, roles and permissions, entities and your own security.',
  },
  {
    // Hidden until the help centre exists.
    key: 'help',
    module: null,
    label: 'Help',
    to: '/help',
    icon: LifeBuoy,
    group: 'footer',
    status: 'hidden',
    keywords: ['support', 'guides', 'how to', 'help centre'],
    comingSoon: 'Short guides for each task, written for your role. They arrive with each module.',
  },
]

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

/**
 * Home, then the role's modules after a gap. No group headings: even an owner's ten entries
 * read at a glance, and headings were noise (UI review). The labels stay for screen readers.
 */
export function sidebarSections(
  permissions: PermissionSet | null,
): { heading: string; items: NavItem[] }[] {
  const items = visibleNav(permissions).filter((i) => i.group !== 'footer')
  return [
    { heading: 'Overview', items: items.filter((i) => i.key === 'home') },
    { heading: 'Modules', items: items.filter((i) => i.key !== 'home') },
  ].filter((section) => section.items.length > 0)
}

/** Home plus up to three modules; custom roles get their first three in sidebar order. */
export function mobileTabs(
  permissions: PermissionSet | null,
  roleKey: SystemRoleKey | null,
): NavItem[] {
  const viewable = visibleNav(permissions)
  const modules = viewable.filter((item) => item.module !== null && item.group !== 'footer')
  const priority = roleKey ? MOBILE_TAB_PRIORITY[roleKey] : null
  const picked = priority
    ? priority.flatMap((key) => modules.filter((item) => item.key === key))
    : modules
  const home = viewable.filter((item) => item.key === 'home')
  return [...home, ...picked.slice(0, MAX_MODULE_TABS)]
}

/** Settings (owners and admins by default) and Help, at the bottom of the sidebar. */
export function footerNav(permissions: PermissionSet | null): NavItem[] {
  return visibleNav(permissions).filter((item) => item.group === 'footer')
}

/** The modules for Home's "Your workspace" grid: the sidebar's entries, without Home. */
export function workspaceModules(permissions: PermissionSet | null): NavItem[] {
  return visibleNav(permissions).filter((item) => item.group !== 'footer' && item.key !== 'home')
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
