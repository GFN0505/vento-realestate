const lagosMonthDay = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  month: '2-digit',
  day: '2-digit',
})

/**
 * A short reference a person can read out to support, e.g. "ERR-7F3A-1126": the first four hex
 * digits of the request id and the Lagos month and day. The full request id is in the same log
 * line, so the short form only has to narrow the search, not be unique.
 */
export function errorReference(requestId: string, at: Date): string {
  const hex = requestId
    .replace(/[^0-9a-f]/gi, '')
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, '0')
  const parts = lagosMonthDay.formatToParts(at)
  const month = parts.find((p) => p.type === 'month')?.value ?? '00'
  const day = parts.find((p) => p.type === 'day')?.value ?? '00'
  return `ERR-${hex}-${month}${day}`
}

/** Matches what `errorReference` produces. */
export const ERROR_REFERENCE_PATTERN = /^ERR-[0-9A-F]{4}-\d{4}$/
