/** "owners", "owners and admins", "owners, admins and finance staff". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

// C0 and C1 controls, and the invisible direction marks and overrides that can make a name
// display differently from what it is ("Trojan Source"-style spoofing).
// Matching control characters is the point of this pattern: it finds hidden characters to refuse.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional, see above
const HIDDEN_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/

/** True when text holds control or direction-override characters. */
export function hasHiddenCharacters(value: string): boolean {
  return HIDDEN_CHARACTERS.test(value)
}

export const HIDDEN_CHARACTERS_MESSAGE = 'Remove hidden characters, like line breaks or tabs'

/** Like hasHiddenCharacters, for longer text (notes, reasons) where line breaks are fine. */
export function hasHiddenCharactersInText(value: string): boolean {
  return HIDDEN_CHARACTERS.test(value.replace(/\r?\n/g, ''))
}

export const HIDDEN_CHARACTERS_IN_TEXT_MESSAGE = 'Remove hidden characters, like tabs'
