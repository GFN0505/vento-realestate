const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})

/** "2026-11-30" or an ISO date-time → "30 Nov 2026" (Lagos time). */
export function formatDate(value: string): string {
  // A bare date is a calendar day, not an instant: read it at Lagos noon so it never shifts.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00+01:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
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

const lagosDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' })

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

const dayMonthFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Lagos',
})

/** An instant → "3 Dec" (Lagos), for near dates where the year goes without saying. */
export function formatDayMonth(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dayMonthFormat.format(date)
}

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
const month = (n: number) => monthName.format(new Date(Date.UTC(2026, ((n - 1 + 12) % 12) | 0, 1)))

/** The financial year that starts in a month (1–12): 4 → "April – March". */
export function financialYearSpan(startMonth: number): string {
  return `${month(startMonth)} – ${month(startMonth - 1)}`
}
