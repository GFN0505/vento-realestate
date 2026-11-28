import { z } from 'zod'
import {
  HIDDEN_CHARACTERS_IN_TEXT_MESSAGE,
  HIDDEN_CHARACTERS_MESSAGE,
  hasHiddenCharacters,
  hasHiddenCharactersInText,
} from '../common/text'

// Free-text fields shared by the parcel and encumbrance schemas (apart, so neither imports the
// other's file).

/** Short free text: trimmed, '' means none (stored as null). */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { message: `Use ${max} characters or fewer for ${label}` })
    .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null)

/** Longer text (notes), where line breaks are fine but other hidden characters aren't. */
export const optionalNotes = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Use ${max} characters or fewer` })
    .refine((v) => !hasHiddenCharactersInText(v), { message: HIDDEN_CHARACTERS_IN_TEXT_MESSAGE })
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null)
