import { Decimal } from '../common/decimal'

// Size is entered in hectares, square metres or plots and stored in m² (numeric(14,2)). A plot
// is 600 m² unless the parcel says otherwise ("12 plots of 648 m²"). Decimal only, never floats.

export const SIZE_UNITS = ['ha', 'sqm', 'plots'] as const
export type SizeUnit = (typeof SIZE_UNITS)[number]

export const SIZE_UNIT_LABELS: Readonly<Record<SizeUnit, string>> = {
  ha: 'Hectares',
  sqm: 'Square metres',
  plots: 'Plots',
}

/** The usual Lagos plot; stored explicitly on the parcel so a later change never moves it. */
export const DEFAULT_PLOT_SQM = '600.00'

const SQM_PER_HECTARE = 10_000

/** numeric(14,2): 12 digits before the point. */
export const MAX_SIZE_SQM = new Decimal('999999999999.99')

export type SizeEntry = { value: string; unit: SizeUnit; plotSizeSqm?: string | null }

/** The plot size a parcel stores: the one given, or 600 m², and only for plots. */
export function plotSizeFor(entry: SizeEntry): string | null {
  if (entry.unit !== 'plots') return null
  return new Decimal(entry.plotSizeSqm ?? DEFAULT_PLOT_SQM).toFixed(2)
}

/** The entry in m², as a decimal (not rounded). */
export function sizeSqmDecimal(entry: SizeEntry): Decimal {
  const value = new Decimal(entry.value)
  if (entry.unit === 'ha') return value.times(SQM_PER_HECTARE)
  if (entry.unit === 'plots') return value.times(plotSizeFor(entry) ?? DEFAULT_PLOT_SQM)
  return value
}

/** The entry in m² as stored: "7200.00" for 12 plots of 600 m². */
export function toSqm(entry: SizeEntry): string {
  return sizeSqmDecimal(entry).toDecimalPlaces(2).toFixed(2)
}

/** "0.72": hectares to two decimals, as lists show them. */
export function hectares(sqm: string): string {
  return new Decimal(sqm).dividedBy(SQM_PER_HECTARE).toFixed(2)
}

const grouped = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** "1,250.5": thousands separators, trailing zeros dropped. */
function plain(value: string): string {
  const d = new Decimal(value)
  const [whole = '0', fraction] = d.toFixed().split('.')
  return fraction ? `${grouped(whole)}.${fraction}` : grouped(whole)
}

/**
 * How a size reads: "4.20 ha", "1,200 m² (0.12 ha)", "12 plots (0.72 ha)", "12 plots of 648 m²
 * (0.78 ha)" when the plot isn't the usual 600 m².
 */
export function sizeText(parcel: {
  sizeSqm: string
  sizeUnit: SizeUnit
  sizeEntered: string
  plotSizeSqm: string | null
}): string {
  const ha = `${hectares(parcel.sizeSqm)} ha`
  if (parcel.sizeUnit === 'ha') return ha
  if (parcel.sizeUnit === 'sqm') return `${plain(parcel.sizeEntered)} m² (${ha})`
  const n = plain(parcel.sizeEntered)
  const plots = new Decimal(parcel.sizeEntered).eq(1) ? '1 plot' : `${n} plots`
  const plot = parcel.plotSizeSqm ?? DEFAULT_PLOT_SQM
  const of = new Decimal(plot).eq(DEFAULT_PLOT_SQM) ? '' : ` of ${plain(plot)} m²`
  return `${plots}${of} (${ha})`
}
