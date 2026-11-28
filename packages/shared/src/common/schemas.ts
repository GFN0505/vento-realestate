import { z } from 'zod'

/** UUID v7 primary keys. */
export const id = z.uuid({ version: 'v7', message: 'Invalid ID' })

/** ISO 4217 currencies the product handles. NGN is the base currency. */
export const currency = z.enum(['NGN', 'USD', 'GBP', 'EUR'])
export type Currency = z.infer<typeof currency>

/** A calendar date with no time (due dates, permit dates): "2026-11-25". */
export const isoDate = z.iso.date({ message: 'Enter a valid date' })

/** Deepest page a list serves: past it, narrow the search (an OFFSET that deep is a full scan). */
export const MAX_PAGE = 10_000

/** Input for every list endpoint. */
export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type PaginationInput = z.infer<typeof paginationInput>

/** Output shape for every list endpoint: `{ items, page, pageSize, total }`. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
}
