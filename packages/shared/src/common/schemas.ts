import { z } from 'zod'
import { toMoneyString } from './decimal'

/** UUID v7 primary keys. */
export const id = z.uuid({ version: 'v7', message: 'Invalid ID' })

/** ISO 4217 currencies the product handles. NGN is the base currency. */
export const currency = z.enum(['NGN', 'USD', 'GBP', 'EUR'])
export type Currency = z.infer<typeof currency>

// numeric(14,2): up to 12 digits before the point and 2 after.
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/
const SIGNED_MONEY_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/
const MONEY_MESSAGE = 'Enter an amount like 1250000 or 1250000.50'

/**
 * A money amount as a decimal string (e.g. "1250000.00"), never a number. Zero or more:
 * prices, receipts and instalments are never negative. Normalises to exactly 2 decimals.
 */
export const money = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, { message: MONEY_MESSAGE })
  .transform(toMoneyString)

/** A money amount that may be negative. Only for adjustments, balances and reversals. */
export const signedMoney = z
  .string()
  .trim()
  .regex(SIGNED_MONEY_PATTERN, { message: MONEY_MESSAGE })
  .transform(toMoneyString)

/** A calendar date with no time (due dates, permit dates): "2026-11-25". */
export const isoDate = z.iso.date({ message: 'Enter a valid date' })

/** Input for every list endpoint. */
export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
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
