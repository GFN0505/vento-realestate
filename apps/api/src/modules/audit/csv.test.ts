import { describe, expect, it } from 'vitest'
import { csvCell, csvLine } from './csv'

describe('audit CSV', () => {
  it('quotes every cell and doubles quotes inside', () => {
    expect(csvLine(['Aisha "Ace" Bello', null, 'a,b'])).toBe('"Aisha ""Ace"" Bello","","a,b"')
  })

  it.each(['=1+1', '+234 801', '-2', '@SUM(A1)', '\tx', '\rx'])(
    'opens %j as text, never as a formula',
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`)
    },
  )

  it('leaves ordinary text alone', () => {
    expect(csvCell('Changed role Site engineer')).toBe('"Changed role Site engineer"')
  })
})
