// CSV for the audit log export. Every cell is quoted; a cell a spreadsheet would read as a
// formula (starting with = + - @, a tab or a carriage return) gets a leading apostrophe, so an
// entry like a person named "=HYPERLINK(…)" opens as text (OWASP CSV injection).

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: string | null): string {
  const text = value ?? ''
  const safe = FORMULA_START.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function csvLine(cells: readonly (string | null)[]): string {
  return cells.map(csvCell).join(',')
}

/** With a byte-order mark, so Excel reads the file as UTF-8 (₦, names with accents). */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | null)[])[],
): string {
  return `\uFEFF${[header, ...rows].map(csvLine).join('\r\n')}\r\n`
}
