/*
 * Readers for hand-written route search validation (no zod: it runs in the entry bundle). One
 * shared set, so every page's address is read the same way and the first load carries it once.
 * Each returns undefined for anything it can't use: a hand-edited link is ignored, never an error.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const isUuid = (value: string): boolean => UUID.test(value)

/** A value matching `pattern`. */
export const matching = (value: unknown, pattern: RegExp): string | undefined =>
  typeof value === 'string' && pattern.test(value) ? value : undefined

export const uuidParam = (value: unknown): string | undefined => matching(value, UUID)

/** Trimmed text of 1 to `max` characters. */
export const textParam = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined

/** A page number after the first (page 1 keeps the address bare). */
export function pageParam(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isInteger(n) && n > 1 && n < 10_000 ? n : undefined
}

/** A real calendar date, "2026-11-27". */
export function dateParam(value: unknown): string | undefined {
  const date = matching(value, DATE)
  return date && !Number.isNaN(Date.parse(date)) ? date : undefined
}

export const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | undefined =>
  options.find((option) => option === value)
