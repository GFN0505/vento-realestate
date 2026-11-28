// Encumbrances (land spec slice 2, plan §2). No zod, so the web can import it alone. Order is
// severity, most serious first: banners, badges and Home name the first one in this order.

export const ENCUMBRANCE_TYPES = [
  'court_order',
  'caveat',
  'family_dispute',
  'lien',
  'mortgage',
] as const
export type EncumbranceType = (typeof ENCUMBRANCE_TYPES)[number]

export const ENCUMBRANCE_STATUSES = ['active', 'cleared'] as const
export type EncumbranceStatus = (typeof ENCUMBRANCE_STATUSES)[number]

export const ENCUMBRANCE_LABELS: Readonly<Record<EncumbranceType, string>> = {
  court_order: 'Court order',
  caveat: 'Caveat',
  family_dispute: 'Family dispute',
  lien: 'Lien',
  mortgage: 'Mortgage',
}

/** Mid-sentence: "Clear the caveat before archiving this parcel." */
export const ENCUMBRANCE_WORDS: Readonly<Record<EncumbranceType, string>> = {
  court_order: 'court order',
  caveat: 'caveat',
  family_dispute: 'family dispute',
  lien: 'lien',
  mortgage: 'mortgage',
}

/**
 * Court orders, caveats, liens and family disputes always block sales; a mortgage only when
 * chosen on recording (spec question 2), because construction finance normally allows sales.
 */
export function alwaysBlocks(type: EncumbranceType): boolean {
  return type !== 'mortgage'
}

/** "Hearing" for a court order; "Next date" for the rest. */
export function nextDateLabel(type: EncumbranceType): string {
  return type === 'court_order' ? 'Hearing' : 'Next date'
}

/**
 * Next dates show on the Land & legal home from this many days before (owner, 28 Nov 2026). A
 * product setting, not a statutory number.
 */
export const NEXT_DATE_WINDOW_DAYS = 30

type Ranked = { type: EncumbranceType; blocksSales: boolean; servedOn: string }

/** Blocking ones first, then by severity, then the oldest served. */
export function compareSeriousness(a: Ranked, b: Ranked): number {
  if (a.blocksSales !== b.blocksSales) return a.blocksSales ? -1 : 1
  const bySeverity = ENCUMBRANCE_TYPES.indexOf(a.type) - ENCUMBRANCE_TYPES.indexOf(b.type)
  if (bySeverity !== 0) return bySeverity
  return a.servedOn < b.servedOn ? -1 : a.servedOn > b.servedOn ? 1 : 0
}

/** The encumbrance a banner or badge names, or null for none. */
export function mostSerious<T extends Ranked>(list: readonly T[]): T | null {
  return [...list].sort(compareSeriousness)[0] ?? null
}

/** "Caveat · CV/LAG/2026/114", or "Caveat · 4 Nov 2026" without a reference (document names). */
export function encumbranceSuffix(
  type: EncumbranceType,
  reference: string | null,
  servedOnText: string,
): string {
  return `${ENCUMBRANCE_LABELS[type]} · ${reference ?? servedOnText}`
}

/**
 * Sane dates (security L6): a served or lodged date from 1900 (a typo like 0202 is refused), and a
 * hearing or next date from a year before it was served up to ten years ahead. Product bounds,
 * not statutory numbers.
 */
export const EARLIEST_SERVED_ON = '1900-01-01'
export const NEXT_ON_YEARS_BEFORE_SERVED = 1
export const NEXT_ON_YEARS_AHEAD = 10

/** "2027-03-04" moved by whole years (29 Feb lands on 28 Feb). */
export function addYears(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const year = y + years
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The earliest and latest next date an encumbrance served on `servedOn` may carry. */
export function nextOnBounds(servedOn: string, today: string): { min: string; max: string } {
  return {
    min: addYears(servedOn, -NEXT_ON_YEARS_BEFORE_SERVED),
    max: addYears(today, NEXT_ON_YEARS_AHEAD),
  }
}
