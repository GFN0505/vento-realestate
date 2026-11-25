// Nigerian users read times in West Africa Time, whatever the server's zone.
const LAGOS = 'Africa/Lagos'

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: LAGOS,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: LAGOS,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const isoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: LAGOS,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** "10:45" in Lagos. */
export function formatTime(date: Date): string {
  return timeFormat.format(date)
}

/** "25 Nov 2026" in Lagos (en-GB writes "Sept"; the product writes "Sep"). */
export function formatDate(date: Date): string {
  return dateFormat.format(date).replace('Sept', 'Sep')
}

/** "2026-11-25": the calendar day in Lagos. */
export function lagosIsoDate(date: Date): string {
  return isoDateFormat.format(date)
}
