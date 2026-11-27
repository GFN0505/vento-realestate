import { describe, expect, it } from 'vitest'
import { ageText, amountText, requestState, stepWords } from './approval-words'

const now = new Date('2026-11-27T12:00:00.000Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('approval words', () => {
  it('ages a request the way the board does', () => {
    expect(ageText(ago(20_000), now)).toBe('just now')
    expect(ageText(ago(35 * 60_000), now)).toBe('35 min ago')
    expect(ageText(ago(2 * 3_600_000), now)).toBe('2 h ago')
    expect(ageText(ago(3 * 86_400_000), now)).toBe('3 days ago')
    expect(ageText('2026-10-01T09:00:00.000Z', now)).toBe('1 Oct 2026')
  })

  it('shows a foreign amount with its naira value beside it', () => {
    expect(amountText({ value: '12500.00', currency: 'USD', ngnValue: '19375000.00' })).toEqual({
      main: '$12,500',
      ngn: '≈ ₦19,375,000',
    })
  })

  it('says where each request stands', () => {
    const base = { waitingFor: 'Finance', lastDecision: null, endedReason: null }
    expect(requestState({ ...base, status: 'pending' }).label).toBe('Waiting for Finance')
    expect(
      requestState({
        ...base,
        status: 'rejected',
        lastDecision: { name: 'Aisha Bello', decision: 'reject', comment: 'Over budget' },
      }),
    ).toEqual({ label: 'Rejected: “Over budget”', tone: 'rose' })
    expect(
      requestState({
        ...base,
        status: 'approved',
        lastDecision: { name: 'Aisha Bello', decision: 'approve', comment: null },
      }).label,
    ).toBe('Approved by Aisha Bello')
    expect(requestState({ ...base, status: 'expired' }).label).toBe('Expired')
  })

  it('reads a decided step as a sentence for screen readers', () => {
    const words = stepWords(
      {
        position: 1,
        text: 'Finance review',
        state: 'approved',
        isYou: false,
        decision: {
          memberName: 'Aisha Bello',
          decision: 'approve',
          comment: 'Price checked',
          decidedAt: ago(40 * 60_000),
        },
      },
      now,
    )
    expect(words.title).toBe('Finance review — Aisha Bello')
    expect(words.spoken).toBe('Finance review, approved by Aisha Bello, 40 minutes ago')
  })
})
