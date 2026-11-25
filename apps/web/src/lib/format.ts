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
