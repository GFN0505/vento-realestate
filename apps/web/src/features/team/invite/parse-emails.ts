import { MAX_INVITATIONS_PER_BATCH } from '@vento/shared'
import { suggestEmail } from '@/lib/email-typo'

/*
 * Turns whatever people paste into invite rows: a column from Excel (new lines or tabs), a
 * Gmail or Outlook "To" list ("Aisha Bello" <aisha@ventohomes.ng>, Grace <grace@…>), or
 * addresses split by commas, semicolons or spaces. Pure, so it's tested on its own.
 */

export type ParsedEmail = {
  email: string
  /** Looks like an address; false shows "Check this email" on the row. */
  valid: boolean
  /** "Did you mean grace@gmail.com?" */
  suggestion: string | null
}

export type ParseResult = {
  added: ParsedEmail[]
  /** Repeats dropped, within the paste or against rows already there ("Removed 1 duplicate"). */
  duplicates: number
  /** What didn't fit under the batch limit, left in the box. */
  rest: string
}

const ENTRY_SEPARATORS = /[\n\r\t,;]+/
const WORD_SEPARATORS = /\s+/
// Deliberately loose: the server has the final word; this only catches the obvious slips.
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i

/** Raw addresses in order. `Name <address>` keeps only the address; stray punctuation goes. */
export function emailTokens(text: string): string[] {
  const tokens: string[] = []
  for (const entry of text.split(ENTRY_SEPARATORS)) {
    const bracketed = entry.match(/<([^<>]*)>/)
    const parts = bracketed?.[1] !== undefined ? [bracketed[1]] : entry.split(WORD_SEPARATORS)
    for (const part of parts) {
      const token = part
        .trim()
        .replace(/^mailto:/i, '')
        .replace(/^["'([<]+|["')\]>.]+$/g, '')
        .toLowerCase()
      if (token) tokens.push(token)
    }
  }
  return tokens
}

export function toParsed(email: string): ParsedEmail {
  const valid = EMAIL.test(email)
  return { email, valid, suggestion: valid ? suggestEmail(email) : null }
}

export function parseEmails(
  text: string,
  existing: readonly string[],
  max: number = MAX_INVITATIONS_PER_BATCH,
): ParseResult {
  const seen = new Set(existing)
  const added: ParsedEmail[] = []
  const overflow: string[] = []
  let duplicates = 0
  for (const token of emailTokens(text)) {
    if (seen.has(token)) {
      duplicates++
      continue
    }
    seen.add(token)
    if (existing.length + added.length >= max) overflow.push(token)
    else added.push(toParsed(token))
  }
  return { added, duplicates, rest: overflow.join('\n') }
}

/**
 * While typing: an address followed by a comma, space or new line becomes a row; the unfinished
 * part stays in the box. A `Name <address` still being typed isn't split.
 */
export function splitTyped(value: string): { complete: string; partial: string } {
  if (value.lastIndexOf('<') > value.lastIndexOf('>')) return { complete: '', partial: value }
  const match = value.match(/^([\s\S]*[\s,;])([^\s,;]*)$/)
  if (!match) return { complete: '', partial: value }
  return { complete: match[1] ?? '', partial: match[2] ?? '' }
}
