/*
 * Month names are written out: Intl's en-GB short month became "Sept" in newer browsers, and
 * every date in the product reads `d Mon yyyy`.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const lagosDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' })
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A bare date as it is (a calendar day, never shifted), an instant as its Lagos day. */
export function lagosParts(value: string): { y: string; m: string; d: number } | null {
  const ymd = BARE_DATE.test(value)
    ? value
    : Number.isNaN(new Date(value).getTime())
      ? null
      : lagosDay.format(new Date(value))
  const [y = '', m = '', d = ''] = ymd?.split('-') ?? []
  const month = MONTHS[Number(m) - 1]
  return month ? { y, m: month, d: Number(d) } : null
}

/** "2026-11-30" or an ISO date-time → "30 Nov 2026" (Lagos time). */
export function formatDate(value: string): string {
  const p = lagosParts(value)
  return p ? `${p.d} ${p.m} ${p.y}` : value
}

/** "Vento Homes Ltd" → "VH". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

/** Today's calendar date in Lagos, "2026-11-28": the upper bound of date fields that can't be future. */
export function todayInLagos(now: Date = new Date()): string {
  return lagosDay.format(now)
}

/** Whole days from today (Lagos) to a calendar date: 0 = today, 1 = tomorrow, -1 = yesterday. */
export function daysUntilInLagos(isoDate: string, now: Date = new Date()): number {
  const today = Date.parse(`${lagosDay.format(now)}T00:00:00Z`)
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - today) / 86_400_000)
}

/** Whole Lagos calendar days from an instant to now: 0 = today, 1 = yesterday. */
export function daysAgoInLagos(iso: string, now: Date = new Date()): number {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 0
  return -daysUntilInLagos(lagosDay.format(then), now)
}

/** A date or an instant → "3 Dec" (Lagos), for near dates where the year goes without saying. */
export function formatDayMonth(value: string): string {
  const p = lagosParts(value)
  return p ? `${p.d} ${p.m}` : value
}

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
const month = (n: number) => monthName.format(new Date(Date.UTC(2026, ((n - 1 + 12) % 12) | 0, 1)))

/** The financial year that starts in a month (1–12): 4 → "April – March". */
export function financialYearSpan(startMonth: number): string {
  return `${month(startMonth)} – ${month(startMonth - 1)}`
}
