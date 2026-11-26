import { describe, expect, it } from 'vitest'
import { emailTokens, parseEmails, splitTyped } from './parse-emails'

const emails = (text: string, existing: string[] = []) =>
  parseEmails(text, existing).added.map((p) => p.email)

describe('parseEmails', () => {
  it('reads a column pasted from Excel', () => {
    expect(emails('aisha@ventohomes.ng\r\ngrace@ventohomes.ng\n\nkunle@ventohomes.ng\n')).toEqual([
      'aisha@ventohomes.ng',
      'grace@ventohomes.ng',
      'kunle@ventohomes.ng',
    ])
  })

  it('reads a Gmail or Outlook list with names', () => {
    const text = '"Aisha Bello" <aisha@ventohomes.ng>, Grace Umeh <Grace@VentoHomes.ng>; kunle@x.ng'
    expect(emails(text)).toEqual(['aisha@ventohomes.ng', 'grace@ventohomes.ng', 'kunle@x.ng'])
  })

  it('splits on commas, semicolons, tabs and spaces alike', () => {
    expect(emails('a@x.ng, b@x.ng;c@x.ng\td@x.ng e@x.ng')).toHaveLength(5)
  })

  it('lowercases, trims and drops stray punctuation', () => {
    expect(emails('  <MAILTO:Ope@X.NG>. ')).toEqual(['ope@x.ng'])
  })

  it('merges duplicates, within the paste and against rows already there', () => {
    const result = parseEmails('a@x.ng a@x.ng b@x.ng', ['b@x.ng'])
    expect(result.added.map((p) => p.email)).toEqual(['a@x.ng'])
    expect(result.duplicates).toBe(2)
  })

  it('keeps 20 and leaves the rest in the box', () => {
    const text = Array.from({ length: 25 }, (_, i) => `p${i}@x.ng`).join('\n')
    const result = parseEmails(text, [])
    expect(result.added).toHaveLength(20)
    expect(result.rest.split('\n')).toEqual([
      'p20@x.ng',
      'p21@x.ng',
      'p22@x.ng',
      'p23@x.ng',
      'p24@x.ng',
    ])
  })

  it('marks junk as needing a check, and offers a fix for a common typo', () => {
    const [junk, typo] = parseEmails('aisha@ grace@gmial.com', []).added
    expect(junk).toMatchObject({ email: 'aisha@', valid: false })
    expect(typo).toMatchObject({ valid: true, suggestion: 'grace@gmail.com' })
  })
})

describe('emailTokens', () => {
  it('ignores empty entries', () => {
    expect(emailTokens(' ,, ;\n')).toEqual([])
  })
})

describe('splitTyped', () => {
  it('commits an address once a separator follows it', () => {
    expect(splitTyped('aisha@x.ng, gra')).toEqual({ complete: 'aisha@x.ng, ', partial: 'gra' })
    expect(splitTyped('aisha@x.ng')).toEqual({ complete: '', partial: 'aisha@x.ng' })
  })

  it('waits while a name and bracket are still being typed', () => {
    expect(splitTyped('Aisha Bello <aisha@')).toEqual({
      complete: '',
      partial: 'Aisha Bello <aisha@',
    })
  })
})
