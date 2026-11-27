// The product is always "Vento Real Estate", never "Vento" alone (decision 0022). The copy tests in
// apps/web and apps/api run every source file, rendered email and help article through
// `findBareVento`, so new copy can't drift back.

/**
 * A "Vento" that is allowed anyway, with the reason. A `phrase` is allowed wherever it appears; a
 * `line` is allowed only as that exact (trimmed) line of that one file.
 */
export type BrandAllowance =
  | { phrase: string; why: string }
  | { file: string; line: string; why: string }

export const BRAND_ALLOW: readonly BrandAllowance[] = [
  { phrase: 'Vento Homes', why: 'The demo customer (customer data, not the product).' },
  {
    phrase: 'Vento | REAL ESTATE',
    why: 'The logo lockup counts as the full name (short form a, owner 27 Nov 2026).',
  },
  {
    file: 'apps/web/src/components/vento-mark.tsx',
    line: 'Vento',
    why: 'The wordmark: it sits beside its "Real Estate" descriptor, so the lockup reads in full.',
  },
]

export type BareVento = {
  /** 1-based line in the scanned text. */
  line: number
  /** That line, trimmed, for the failure message. */
  text: string
}

// "Vento" as a whole word, not followed by "Real Estate" (a line break or &nbsp; may sit between
// them in wrapped JSX or email HTML). Case-sensitive, so `@vento/*`, `VENTO_*` and `vento_app` never
// match; nor do identifiers like `VentoMark` or `talkToVento`, which have no word boundary there.
const BARE_VENTO = /\bVento\b(?!(?:\s|&nbsp;)+Real(?:\s|&nbsp;)+Estate\b)/g

/** Same length, same line breaks: indexes and line numbers still point at the original. */
function blankOut(text: string): string {
  return text.replace(/[^\n]/g, ' ')
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

function allowedLine(file: string | undefined, text: string): boolean {
  if (!file) return false
  const normalised = file.replaceAll('\\', '/')
  return BRAND_ALLOW.some(
    (a) =>
      'line' in a &&
      a.line === text &&
      (normalised === a.file || normalised.endsWith(`/${a.file}`)),
  )
}

/**
 * Every bare "Vento" in `text`, with its line. Pass the file's path (relative to the repo root, or
 * absolute) so file-scoped allowances apply. Strip comments first for source files.
 */
export function findBareVento(text: string, file?: string): BareVento[] {
  let scanned = text
  for (const a of BRAND_ALLOW) {
    if ('phrase' in a) scanned = scanned.replaceAll(a.phrase, blankOut(a.phrase))
  }
  const lines = text.split('\n')
  const found: BareVento[] = []
  for (const match of scanned.matchAll(BARE_VENTO)) {
    const line = lineAt(scanned, match.index)
    const lineText = (lines[line - 1] ?? '').trim()
    if (!allowedLine(file, lineText)) found.push({ line, text: lineText })
  }
  return found
}

// Characters after which a `/` starts a regular expression rather than a division.
const BEFORE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';'])

/**
 * TypeScript or TSX with every comment (line, block and JSX `{/* … *\/}`) blanked out, so only
 * code and copy are scanned. String-aware: quotes, template literals (with nested `${}`) and
 * regular expressions are kept whole, so a `//` inside a URL string isn't taken for a comment.
 * Line breaks are kept, so line numbers still match the file.
 *
 * Not a parser (decision 0022 explains why there isn't one). A quote or regex never runs past the
 * end of its line, so an apostrophe in JSX text ("You're offline") can't swallow the rest of the
 * file; at worst a comment on that same line is kept, which makes the test fail loudly, never pass
 * quietly.
 */
export function stripComments(source: string): string {
  const out = source.split('')
  const n = source.length
  // The last significant code character, to tell a regex from a division.
  let prev = ''

  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }

  /** Index just after a '…' or "…" string (or at the line break of an unclosed one). */
  const quoted = (start: number, quote: string): number => {
    let j = start + 1
    while (j < n) {
      const c = source[j]
      if (c === '\\') j += 2
      else if (c === quote) return j + 1
      else if (c === '\n') return j
      else j++
    }
    return n
  }

  /** Index just after a regex literal, or `start + 1` when it was a division after all. */
  const regex = (start: number): number => {
    let j = start + 1
    let inClass = false
    while (j < n && source[j] !== '\n') {
      const c = source[j]
      if (c === '\\') j += 2
      else {
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) return j + 1
        j++
      }
    }
    return start + 1
  }

  /** Code from `start`; when `nested`, it ends at the `}` closing a template's `${`. */
  const code = (start: number, nested: boolean): number => {
    let i = start
    let depth = 0
    while (i < n) {
      const c = source[i] as string
      const next = source[i + 1]
      if (c === '/' && next === '/') {
        const end = source.indexOf('\n', i)
        const stop = end < 0 ? n : end
        blank(i, stop)
        i = stop
      } else if (c === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2)
        const stop = end < 0 ? n : end + 2
        blank(i, stop)
        i = stop
      } else if (c === "'" || c === '"') {
        i = quoted(i, c)
        prev = 'a'
      } else if (c === '`') {
        i = template(i + 1)
        prev = 'a'
      } else if (c === '/' && BEFORE_REGEX.has(prev)) {
        const end = regex(i)
        prev = end === i + 1 ? '/' : 'a'
        i = end
      } else {
        if (c === '{') depth++
        else if (c === '}') {
          if (nested && depth === 0) return i + 1
          depth--
        }
        if (!/\s/.test(c)) prev = c
        i++
      }
    }
    return n
  }

  /** Index just after a template literal's closing backtick. */
  const template = (start: number): number => {
    let i = start
    while (i < n) {
      const c = source[i]
      if (c === '\\') i += 2
      else if (c === '`') return i + 1
      else if (c === '$' && source[i + 1] === '{') i = code(i + 2, true)
      else i++
    }
    return n
  }

  code(0, false)
  return out.join('')
}
