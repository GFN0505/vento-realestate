/*
 * Home's greeting and date line, in Lagos time whatever the device's clock zone (a director
 * abroad still sees the site's day).
 */

const hourInLagos = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  hour: 'numeric',
  hourCycle: 'h23',
})

const longDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** "Good morning, Olumide" from 5 am to noon, afternoon until 5 pm, evening after (and past midnight). */
export function greeting(fullName: string, at: Date = new Date()): string {
  const hour = Number(hourInLagos.format(at))
  const part =
    hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening'
  const first = fullName.trim().split(/\s+/)[0]
  return first ? `Good ${part}, ${first}` : `Good ${part}`
}

/** "Thursday, 26 November 2026". */
export function longDateInLagos(at: Date = new Date()): string {
  // en-GB writes "Thursday 26 November 2026"; the spec has a comma after the weekday.
  const parts = longDate.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value
  return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`
}
