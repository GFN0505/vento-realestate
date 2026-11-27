import {
  Building2Icon,
  FlagIcon,
  HistoryIcon,
  LayersIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ShieldCheckIcon,
} from 'lucide-react'

export type ConsoleNavItem = {
  key: 'dashboard' | 'organizations' | 'releases' | 'plans' | 'activity' | 'super-admins'
  label: string
  to:
    | '/console'
    | '/console/organizations'
    | '/console/releases'
    | '/console/plans'
    | '/console/activity'
    | '/console/super-admins'
  icon: LucideIcon
}

/** Only built sections (spec: the 3a rule). Failed jobs and Usage & AI arrive with their slices. */
export const CONSOLE_NAV: readonly ConsoleNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/console', icon: LayoutDashboardIcon },
  {
    key: 'organizations',
    label: 'Organizations',
    to: '/console/organizations',
    icon: Building2Icon,
  },
  { key: 'releases', label: 'Releases', to: '/console/releases', icon: FlagIcon },
  { key: 'plans', label: 'Plans', to: '/console/plans', icon: LayersIcon },
  { key: 'activity', label: 'Activity', to: '/console/activity', icon: HistoryIcon },
  {
    key: 'super-admins',
    label: 'Super-admins',
    to: '/console/super-admins',
    icon: ShieldCheckIcon,
  },
]

/** Phones: three tabs, the rest (and My account) under More (plan §1b.13). */
export const CONSOLE_TABS = CONSOLE_NAV.slice(0, 3)
export const CONSOLE_MORE = CONSOLE_NAV.slice(3)

/** The Dashboard is `/console` exactly; every other section includes its detail pages. */
export function isCurrent(item: ConsoleNavItem, pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/'
  if (item.to === '/console') return path === '/console'
  return path === item.to || path.startsWith(`${item.to}/`)
}

export const STAFF_LABEL = 'Vento Real Estate staff · all customers'
/** Approved short form (b), phone top bar only: the full label doesn't fit beside the lockup. */
export const STAFF_LABEL_SHORT = 'Staff · all customers'
export const CONSOLE_NAME = 'Vento Real Estate console'
