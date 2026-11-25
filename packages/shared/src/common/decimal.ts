import DecimalJs from 'decimal.js'

/**
 * The only way to do arithmetic on money and rates. Never use JS numbers for money:
 * binary floating point can't represent most decimal amounts exactly.
 * Banker's rounding is avoided; amounts round half up, as on Nigerian receipts.
 */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP })
export type Decimal = InstanceType<typeof Decimal>

/** Largest magnitude `numeric(14,2)` can hold: 12 digits before the point. */
export const MONEY_LIMIT = new Decimal('999999999999.99')

/**
 * Formats a decimal as a 2-dp money string, the shape stored in `numeric(14,2)`.
 * Throws instead of producing a value Postgres would reject.
 */
export function toMoneyString(value: DecimalJs.Value): string {
  const rounded = new Decimal(value).toDecimalPlaces(2)
  if (rounded.abs().gt(MONEY_LIMIT)) {
    throw new RangeError(`Amount ${rounded.toFixed(2)} is too large to store`)
  }
  // -0.001 rounds to -0; show it as 0.00, never "-0.00".
  return rounded.isZero() ? '0.00' : rounded.toFixed(2)
}
