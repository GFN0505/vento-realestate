import {
  Building2Icon,
  FlagIcon,
  HistoryIcon,
  LayersIcon,
  type LucideIcon,
  ShieldCheckIcon,
} from 'lucide-react'

export type ConsoleNavItem = {
  key: 'organizations' | 'releases' | 'plans' | 'activity' | 'super-admins'
  label: string
  to:
    | '/console'
    | '/console/releases'
    | '/console/plans'
    | '/console/activity'
    | '/console/super-admins'
  icon: LucideIcon
  /** Below this path counts as this section (detail pages). */
  section: string
}

/** Only built sections (spec: the 3a rule). Failed jobs and Usage & AI arrive with their slices. */
export const CONSOLE_NAV: readonly ConsoleNavItem[] = [
  {
    key: 'organizations',
    label: 'Organizations',
    to: '/console',
    icon: Building2Icon,
    section: '/console/organizations',
  },
  {
    key: 'releases',
    label: 'Releases',
    to: '/console/releases',
    icon: FlagIcon,
    section: '/console/releases',
  },
  {
    key: 'plans',
    label: 'Plans',
    to: '/console/plans',
    icon: LayersIcon,
    section: '/console/plans',
  },
  {
    key: 'activity',
    label: 'Activity',
    to: '/console/activity',
    icon: HistoryIcon,
    section: '/console/activity',
  },
  {
    key: 'super-admins',
    label: 'Super-admins',
    to: '/console/super-admins',
    icon: ShieldCheckIcon,
    section: '/console/super-admins',
  },
]

/** Phones: three tabs, the rest under More. */
export const CONSOLE_TABS = CONSOLE_NAV.slice(0, 3)
export const CONSOLE_MORE = CONSOLE_NAV.slice(3)

export function isCurrent(item: ConsoleNavItem, pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/'
  if (item.to === '/console') return path === '/console' || path.startsWith(item.section)
  return path === item.to || path.startsWith(`${item.section}/`)
}

export const STAFF_LABEL = 'Vento staff · all customers'
