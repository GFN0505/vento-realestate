import { lagosDay, lagosParts } from './format'

/*
 * Formats only some pages need (activity times, money on a parcel), kept out of format.ts,
 * which Home's first load carries.
 */

const lagosTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Lagos',
})

/** An instant → "25 Nov 14:12" (Lagos); "25 Nov 2025 14:12" when it isn't this year. */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  const p = lagosParts(iso)
  if (!p) return iso
  const day = p.y === lagosDay.format(now).slice(0, 4) ? `${p.d} ${p.m}` : `${p.d} ${p.m} ${p.y}`
  return `${day} ${lagosTime.format(new Date(iso))}`
}

const grouped = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * "840000000.00" → "₦840,000,000.00": money always shows its kobo (ux-writing). Read from the
 * string, so there are no floats and no decimal library on the page.
 */
export function formatNaira(amount: string): string {
  const [whole = '0', fraction = ''] = amount.trim().split('.')
  return `₦${grouped(whole)}.${`${fraction}00`.slice(0, 2)}`
}
