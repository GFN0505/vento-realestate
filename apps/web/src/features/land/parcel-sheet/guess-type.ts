import type { TitleDocumentType } from '@vento/shared'

/*
 * A first guess at a dropped file's document type from its name (plan §8: survey, gazette,
 * cofo / c of o, consent, deed, receipt, agreement). Only a guess: the row's picker starts on it
 * and the person can change it. No match leaves the picker empty, never "Other".
 */

const RULES: readonly [RegExp, TitleDocumentType][] = [
  [/\bsurvey\b/, 'survey_plan'],
  [/\b(gazette|excision)\b/, 'excision_gazette'],
  // Consent before C of O: "governor's consent on c of o" is the consent.
  [/\b(consent|governors?)\b/, 'governors_consent'],
  [/\b(deed|assignment)\b/, 'deed_of_assignment'],
  [/\b(r ?of ?o|rofo|right of occupancy)\b/, 'r_of_o'],
  [/\b(c ?of ?o|cofo|certificate of occupancy)\b/, 'c_of_o'],
  [/\breceipts?\b/, 'family_receipt'],
  [/\b(agreement|purchase)\b/, 'land_purchase_agreement'],
]

/** "C_of_O-Plot22.pdf" → "c of o plot22": separators read as spaces, the extension goes. */
function words(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function guessDocumentType(fileName: string): TitleDocumentType | null {
  const text = words(fileName)
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? null
}
