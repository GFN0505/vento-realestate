import { lagosIsoDate } from '@/lib/format'

// Lagos is UTC+1 all year (no daylight saving), so a Lagos midnight is 23:00 UTC the day before.

/** "2027-01-02" → the next calendar day. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The instant a day ends in Lagos: 00:00 Lagos on the following day. */
export function endOfLagosDay(isoDate: string): Date {
  return new Date(`${addDays(isoDate, 1)}T00:00:00+01:00`)
}

/** Today's date in Lagos. */
export function lagosToday(now: Date): string {
  return lagosIsoDate(now)
}

/** Whole days from Lagos `today` to `isoDate` (0 = today). */
export function daysUntil(isoDate: string, now: Date): number {
  const a = Date.parse(`${lagosToday(now)}T00:00:00Z`)
  const b = Date.parse(`${isoDate}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
