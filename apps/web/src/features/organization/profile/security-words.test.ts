import { describe, expect, it } from 'vitest'
import { peopleWithoutTwoStep } from './security-words'

describe('the turn-on confirm', () => {
  it('names up to three people and counts the rest', () => {
    expect(peopleWithoutTwoStep({ names: ['Grace Umeh', 'Kunle Ojo'], others: 1 })).toBe(
      "3 people haven't set it up: Grace Umeh, Kunle Ojo and 1 other. They'll set it up at their next sign-in, or within 7 days.",
    )
  })

  it('joins two names with "and"', () => {
    expect(peopleWithoutTwoStep({ names: ['Grace Umeh', 'Kunle Ojo'], others: 0 })).toBe(
      "2 people haven't set it up: Grace Umeh and Kunle Ojo. They'll set it up at their next sign-in, or within 7 days.",
    )
  })

  it('says so when everyone already has it', () => {
    expect(peopleWithoutTwoStep({ names: [], others: 0 })).toBe('Everyone already has two-step on.')
  })
})
