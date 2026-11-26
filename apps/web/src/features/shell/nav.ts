import type { FeatureKey, PermissionModule, PermissionSet, SystemRoleKey } from '@vento/shared'
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
 * The one navigation registry (plan 6.2). The sidebar, phone tabs, More sheet, ⌘K, Home and the
 * 404/403 guards all read it, so a module can never show in one place and not another.
 * An entry shows when it's available to the organization (released and in its plan, from `me`)
 * and the role can view it (decision 12). Anything else appears nowhere: a typed link to an
 * unavailable module is a 404, to one the role can't view a 403.
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

export type NavItem = {
  key: NavKey
  /** null = Home, which every member sees. */
  module: PermissionModule | null
  /** The feature catalog key that releases and sells it; null = core (in every plan). */
  flag: FeatureKey | null
  /**
   * A code fact: the real page exists. Unbuilt modules show "Soon" and the Coming soon page,
   * to internal organizations only; unbuilt core entries (Settings, Help) show to nobody.
   */
  built: boolean
  label: string
  to: NavPath
  icon: LucideIcon
  group: NavGroup
  /** A few words for Home's workspace grid. */
  summary?: string
}

export const NAV: readonly NavItem[] = [
  {
    key: 'home',
    flag: null,
    built: true,
    module: null,
    label: 'Home',
    to: '/',
    icon: House,
    group: 'main',
  },
  {
    key: 'land',
    flag: 'land',
    built: false,
    module: 'land',
    label: 'Land & title',
    to: '/land',
    summary: 'Parcels, titles and encumbrances',
    icon: MapPin,
    group: 'main',
  },
  {
    key: 'projects',
    flag: 'projects',
    built: false,
    module: 'projects',
    label: 'Projects',
    to: '/projects',
    summary: 'Phases, budgets and the site diary',
    icon: Building2,
    group: 'main',
  },
  {
    key: 'estates',
    flag: 'facility',
    built: false,
    module: 'facility',
    label: 'Estates',
    to: '/estates',
    summary: 'Service charge and maintenance',
    icon: Building,
    group: 'main',
  },
  {
    key: 'sales',
    flag: 'sales',
    built: false,
    module: 'sales',
    label: 'Sales',
    to: '/sales',
    summary: 'Leads, units and subscriptions',
    icon: Tag,
    group: 'main',
  },
  {
    key: 'finance',
    flag: 'finance',
    built: false,
    module: 'finance',
    label: 'Finance',
    to: '/finance',
    summary: 'Receipts, ledgers and tax',
    icon: Wallet,
    group: 'main',
  },
  {
    key: 'hr',
    flag: 'hr',
    built: false,
    module: 'hr',
    label: 'HR & payroll',
    to: '/hr',
    summary: 'Staff and payroll',
    icon: Users,
    group: 'main',
  },
  {
    key: 'compliance',
    flag: 'compliance',
    built: false,
    module: 'compliance',
    label: 'Compliance',
    to: '/compliance',
    summary: 'Permits, buyer KYC and AML',
    icon: ShieldCheck,
    group: 'main',
  },
  {
    key: 'documents',
    flag: 'documents',
    built: false,
    module: 'documents',
    label: 'Documents',
    to: '/documents',
    summary: 'Contracts and letters',
    icon: FileText,
    group: 'main',
  },
  {
    key: 'reports',
    flag: 'analytics',
    built: false,
    module: 'analytics',
    label: 'Reports',
    to: '/reports',
    summary: 'Dashboards and board packs',
    icon: ChartColumn,
    group: 'main',
  },
  {
    // Owners and admins by default (settings view); opens its first section (Team in 3b).
    key: 'settings',
    flag: null,
    built: true,
    module: 'settings',
    label: 'Settings',
    to: '/settings',
    icon: Settings,
    group: 'footer',
  },
  {
    // Hidden until the help centre exists.
    key: 'help',
    flag: null,
    built: false,
    module: null,
    label: 'Help',
    to: '/help',
    icon: LifeBuoy,
    group: 'footer',
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

/** What navigation is derived from: the role's permissions and the organization's features. */
export type NavAccess = {
  permissions: PermissionSet | null
  /** Features available to the organization (released and entitled), from `me`. */
  features: ReadonlyMap<FeatureKey, { earlyAccess: boolean }>
  /** Vento's own organizations: they also see unbuilt modules, tagged "Soon". */
  internal: boolean
}

/** The organization has it: a typed link to anything else is a 404, whatever the role. */
export function isAvailable(access: NavAccess, item: NavItem): boolean {
  if (item.flag === null) return item.built
  if (!access.features.has(item.flag)) return false
  return item.built || access.internal
}

/** Available, and the role can view it (decision 12). */
export function canView(access: NavAccess, item: NavItem): boolean {
  if (!isAvailable(access, item)) return false
  return item.module === null || can(access.permissions, item.module, 'view')
}

export type NavTag = 'soon' | 'early_access'

/** "Soon" wins: an unbuilt page has nothing to try early. A trial carries no tag (spec). */
export function navTag(access: NavAccess, item: NavItem): NavTag | null {
  if (!item.built) return 'soon'
  if (item.flag && access.features.get(item.flag)?.earlyAccess) return 'early_access'
  return null
}

/** Home plus every module the organization has and the role can view, in sidebar order. */
export function visibleNav(access: NavAccess): NavItem[] {
  return NAV.filter((item) => canView(access, item))
}

/**
 * Home, then the role's modules after a gap. No group headings: even an owner's ten entries
 * read at a glance, and headings were noise (UI review). The labels stay for screen readers.
 */
export function sidebarSections(access: NavAccess): { heading: string; items: NavItem[] }[] {
  const items = visibleNav(access).filter((i) => i.group !== 'footer')
  return [
    { heading: 'Overview', items: items.filter((i) => i.key === 'home') },
    { heading: 'Modules', items: items.filter((i) => i.key !== 'home') },
  ].filter((section) => section.items.length > 0)
}

/** Home plus up to three modules; custom roles get their first three in sidebar order. */
export function mobileTabs(access: NavAccess, roleKey: SystemRoleKey | null): NavItem[] {
  const viewable = visibleNav(access)
  const modules = viewable.filter((item) => item.module !== null && item.group !== 'footer')
  const priority = roleKey ? MOBILE_TAB_PRIORITY[roleKey] : null
  const picked = priority
    ? priority.flatMap((key) => modules.filter((item) => item.key === key))
    : modules
  const home = viewable.filter((item) => item.key === 'home')
  return [...home, ...picked.slice(0, MAX_MODULE_TABS)]
}

/** Settings (owners and admins by default) and Help, at the bottom of the sidebar. */
export function footerNav(access: NavAccess): NavItem[] {
  return visibleNav(access).filter((item) => item.group === 'footer')
}

/** The modules for Home's "Your workspace" grid: the sidebar's entries, without Home. */
export function workspaceModules(access: NavAccess): NavItem[] {
  return visibleNav(access).filter((item) => item.group !== 'footer' && item.key !== 'home')
}

/** The role's modules that didn't fit in the tabs, for the More sheet. */
export function moreItems(access: NavAccess, roleKey: SystemRoleKey | null): NavItem[] {
  const tabs = new Set(mobileTabs(access, roleKey).map((item) => item.key))
  return visibleNav(access).filter((item) => !tabs.has(item.key))
}

/** For things tied to a module (Home numbers, recent pages): shown only where its entry is. */
export function canViewModule(access: NavAccess, module: PermissionModule): boolean {
  const item = navItemForModule(module)
  return item ? canView(access, item) : can(access.permissions, module, 'view')
}

export function navItemForModule(module: PermissionModule): NavItem | undefined {
  return NAV.find((item) => item.module === module)
}

export function navItem(key: NavKey): NavItem {
  const item = NAV.find((i) => i.key === key)
  if (!item) throw new Error(`Unknown nav key ${key}`)
  return item
}
