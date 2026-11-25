import { z } from 'zod'
import { toMoneyString } from './decimal'

// Kept apart from schemas.ts so screens that only need ids or dates don't load decimal.js.

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
