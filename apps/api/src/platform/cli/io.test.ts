import { describe, expect, it } from 'vitest'
import { printable } from './io'

describe('printable', () => {
  it('shows escape sequences and direction overrides instead of obeying them', () => {
    expect(printable('Evil\u001b[2J Ltd')).toBe('Evil\\u{001b}[2J Ltd')
    expect(printable('Lekki ‮dtl')).toBe('Lekki \\u{202e}dtl')
    expect(printable('a\u0085b')).toBe('a\\u{0085}b')
  })

  it('keeps line breaks and ordinary text', () => {
    expect(printable('Adébáyọ̀ & Sons Ltd\n  next')).toBe('Adébáyọ̀ & Sons Ltd\n  next')
  })
})
