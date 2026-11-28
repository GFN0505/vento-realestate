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
  type LucideProps,
  PhoneCall,
  Plane,
  Receipt,
  ScrollText,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
  Wrench,
} from 'lucide-react'

/*
 * The icons of every role's Home numbers. A Home shows four of them, so the set loads beside the
 * page (Home's loader starts it) instead of in the first-load bundle. Loaded by `kpi-icon.tsx`.
 */
const KPI_GLYPHS = {
  'arrow-left-right': ArrowLeftRight,
  'badge-percent': BadgePercent,
  banknote: Banknote,
  'building-2': Building2,
  'calendar-check': CalendarCheck,
  'calendar-clock': CalendarClock,
  'calendar-days': CalendarDays,
  'clipboard-check': ClipboardCheck,
  'file-pen': FilePen,
  'file-search': FileSearch,
  fuel: Fuel,
  gauge: Gauge,
  'hand-coins': HandCoins,
  'hard-hat': HardHat,
  'id-card': IdCard,
  'key-round': KeyRound,
  landmark: Landmark,
  'phone-call': PhoneCall,
  plane: Plane,
  receipt: Receipt,
  'scroll-text': ScrollText,
  'shield-alert': ShieldAlert,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  wrench: Wrench,
} as const satisfies Record<string, LucideIcon>

export type KpiGlyphName = keyof typeof KPI_GLYPHS

export function KpiGlyph({ name, ...props }: LucideProps & { name: KpiGlyphName }) {
  const Icon = KPI_GLYPHS[name]
  return <Icon {...props} />
}
