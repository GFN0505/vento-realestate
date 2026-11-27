import { describe, expect, it } from 'vitest'
import { findBareVento, stripComments } from './bare-vento'

const MARK = 'apps/web/src/components/vento-mark.tsx'

describe('findBareVento', () => {
  it('finds "Vento" on its own, with the line it is on', () => {
    expect(findBareVento('const a = 1\ndocument.title = "Page not found · Vento"')).toEqual([
      { line: 2, text: 'document.title = "Page not found · Vento"' },
    ])
  })

  it('finds the possessive and a bare "Vento" before other words', () => {
    expect(findBareVento("Vento's exception for Sales ended")).toHaveLength(1)
    expect(findBareVento('Talk to Vento')).toHaveLength(1)
  })

  it('accepts the full name, its possessive and a name wrapped across lines', () => {
    expect(findBareVento('Welcome to Vento Real Estate')).toEqual([])
    expect(findBareVento("Vento Real Estate's exception ended")).toEqual([])
    expect(findBareVento('Talk to Vento\n          Real Estate')).toEqual([])
    expect(findBareVento('Vento&nbsp;Real Estate')).toEqual([])
  })

  it('ignores code names, package names and environment keys', () => {
    expect(findBareVento('<VentoMark /> talkToVento @vento/shared VENTO_CRON vento_app')).toEqual(
      [],
    )
  })

  it('allows the demo customer and the logo lockup', () => {
    expect(findBareVento('Vento Homes Ltd invited you')).toEqual([])
    expect(findBareVento('Vento | REAL ESTATE')).toEqual([])
  })

  it('allows the wordmark line only in the logo component', () => {
    const source = '<span>\n  Vento\n</span>'
    expect(findBareVento(source, `/repo/${MARK}`)).toEqual([])
    expect(findBareVento(source, 'apps/web/src/components/other.tsx')).toEqual([
      { line: 2, text: 'Vento' },
    ])
    expect(findBareVento(source)).toHaveLength(1)
  })
})

describe('stripComments', () => {
  it('blanks line and block comments and keeps line numbers', () => {
    const source = 'a // Vento\n/* Vento\n Vento */ b'
    const stripped = stripComments(source)
    expect(stripped.split('\n')).toHaveLength(3)
    expect(stripped).not.toContain('Vento')
    expect(stripped.trim().endsWith('b')).toBe(true)
  })

  it('blanks JSX comments', () => {
    expect(stripComments('<div>{/* Vento console */}</div>')).not.toContain('Vento')
  })

  it('keeps strings that contain comment markers', () => {
    const source = `const url = 'https://ventoerp.com' // Vento\nconst s = "/* Vento */"`
    const stripped = stripComments(source)
    expect(stripped).toContain("'https://ventoerp.com'")
    expect(stripped).toContain('"/* Vento */"')
    expect(stripped.split('\n')[0]).not.toContain('Vento')
  })

  it('keeps template literals, including nested expressions', () => {
    // The scanned source has its own `${…}`; `$` keeps this test's string from being a template.
    const $ = '$'
    const source = `const t = \`Vento ${$}{a ? \`x // ${$}{b}\` : "y"} done\` // note`
    expect(stripComments(source).trimEnd()).toBe(source.replace(' // note', ''))
  })

  it('keeps a regex with slashes and leaves a division alone', () => {
    const source = 'const r = /\\/\\/ x/g // Vento\nconst d = a / b // Vento'
    const stripped = stripComments(source)
    expect(stripped).toContain('/\\/\\/ x/g')
    expect(stripped).toContain('a / b')
    expect(stripped).not.toContain('Vento')
  })

  it('stops an apostrophe in JSX text at the end of its line', () => {
    const source = "<p>You're offline</p>\n{/* Vento */}"
    expect(stripComments(source)).not.toContain('Vento')
  })
})
