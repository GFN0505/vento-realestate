import { describe, expect, it } from 'vitest'
import { dependantsLine } from './archive-words'

const TAIL =
  "can only see this company. They'll see no company data until you give them access to another."

describe('archive confirm', () => {
  it('names up to three people and counts the rest', () => {
    expect(dependantsLine({ count: 3, names: ['Kunle Ojo', 'Ope Martins'] })).toBe(
      `Kunle Ojo, Ope Martins and 1 other ${TAIL}`,
    )
    expect(dependantsLine({ count: 6, names: ['A Bello', 'B Eze', 'C Obi'] })).toBe(
      `A Bello, B Eze, C Obi and 3 others ${TAIL}`,
    )
  })

  it('joins every name when all are shown', () => {
    expect(dependantsLine({ count: 2, names: ['Kunle Ojo', 'Ope Martins'] })).toBe(
      `Kunle Ojo and Ope Martins ${TAIL}`,
    )
    expect(dependantsLine({ count: 1, names: ['Kunle Ojo'] })).toBe(`Kunle Ojo ${TAIL}`)
  })

  it('counts people whose names the viewer may not see', () => {
    expect(dependantsLine({ count: 2, names: [] })).toBe(`2 people ${TAIL}`)
  })
})
