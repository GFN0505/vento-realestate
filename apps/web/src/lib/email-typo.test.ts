import { describe, expect, it } from 'vitest'
import { editDistance, suggestEmail } from './email-typo'

describe('suggestEmail', () => {
  it('fixes a one-letter slip in a common provider', () => {
    expect(suggestEmail('ada@gmial.com')).toBe('ada@gmail.com')
    expect(suggestEmail('ada@yahooo.com')).toBe('ada@yahoo.com')
    expect(suggestEmail('ada@hotmail.con')).toBe('ada@hotmail.com')
  })

  it('fixes a missing letter in the top-level domain', () => {
    expect(suggestEmail('tunde@gmail.co')).toBe('tunde@gmail.com')
  })

  it('uses the typo map for slips edit distance misses', () => {
    expect(suggestEmail('ada@outlok.com.ng')).toBe('ada@outlook.com')
  })

  it('keeps the part before the @ exactly as typed', () => {
    expect(suggestEmail('Ada.Obi+homes@Gmal.com')).toBe('Ada.Obi+homes@gmail.com')
  })

  it('leaves correct providers and real look-alikes alone', () => {
    expect(suggestEmail('ada@gmail.com')).toBeNull()
    expect(suggestEmail('ada@ymail.com')).toBeNull()
    expect(suggestEmail('ada@mail.com')).toBeNull()
  })

  it('leaves work domains alone', () => {
    expect(suggestEmail('grace@ventohomes.ng')).toBeNull()
    expect(suggestEmail('olu@lekkigardens.com')).toBeNull()
  })

  it('says nothing about half-typed emails', () => {
    expect(suggestEmail('ada')).toBeNull()
    expect(suggestEmail('ada@')).toBeNull()
    expect(suggestEmail('@gmial.com')).toBeNull()
  })
})

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('gmail.com', 'gmail.com')).toBe(0)
    expect(editDistance('gmai.com', 'gmail.com')).toBe(1)
    expect(editDistance('gnail.con', 'gmail.com')).toBe(2)
  })
})
