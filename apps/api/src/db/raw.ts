/**
 * Raw `db.execute` rows bypass Drizzle's column mapping, and its pg driver hands timestamps back
 * as strings. Read every timestamp from a raw row through this.
 */
export function rawTimestamp(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value : new Date(value)
}
