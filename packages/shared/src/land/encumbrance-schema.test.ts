import { describe, expect, it } from 'vitest'
import { ENCUMBRANCE_TYPES } from './encumbrance'
import {
  EVIDENCE_REQUIRED,
  NEXT_ON_TOO_EARLY,
  NEXT_ON_TOO_LATE,
  nextOnProblem,
  recordEncumbranceInput,
  requestClearInput,
  updateEncumbranceInput,
} from './encumbrance-schema'

const ID = '01900000-0000-7000-8000-0000000000a1'
const valid = {
  parcelId: ID,
  type: 'caveat',
  blocksSales: true,
  claimant: 'Ogunleye family',
  servedOn: '2026-11-04',
  evidence: { fileId: ID },
}

const messages = (r: { error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? []

describe('recordEncumbranceInput', () => {
  it('takes a caveat with its evidence, optional fields as null', () => {
    expect(recordEncumbranceInput.parse(valid)).toMatchObject({
      reference: null,
      lawyer: null,
      notes: null,
    })
  })

  it.each(ENCUMBRANCE_TYPES.filter((t) => t !== 'mortgage'))(
    'refuses a %s that does not block sales',
    (type) => {
      const r = recordEncumbranceInput.safeParse({ ...valid, type, blocksSales: false })
      expect(r.error?.issues[0]?.path).toEqual(['blocksSales'])
      expect(messages(r)[0]).toMatch(/^An? [a-z ]+ always blocks sales\.$/)
    },
  )

  it('says a court order always blocks sales in the spec’s words', () => {
    const r = recordEncumbranceInput.safeParse({
      ...valid,
      type: 'court_order',
      blocksSales: false,
    })
    expect(messages(r)).toEqual(['A court order always blocks sales.'])
  })

  it('lets a mortgage block sales or not', () => {
    for (const blocksSales of [true, false]) {
      expect(
        recordEncumbranceInput.safeParse({ ...valid, type: 'mortgage', blocksSales }).success,
      ).toBe(true)
    }
  })

  it('asks for the evidence when it is missing', () => {
    const { evidence: _evidence, ...without } = valid
    expect(messages(recordEncumbranceInput.safeParse(without))).toEqual([EVIDENCE_REQUIRED])
  })

  it('refuses a status: only the approval clears', () => {
    expect(recordEncumbranceInput.safeParse({ ...valid, status: 'cleared' }).success).toBe(false)
  })
})

describe('updateEncumbranceInput', () => {
  it('takes only the details sent', () => {
    expect(
      updateEncumbranceInput.parse({ id: ID, expectedVersion: 1, nextOn: '2027-01-14' }),
    ).toEqual({ id: ID, expectedVersion: 1, nextOn: '2027-01-14' })
  })

  it.each([{ type: 'lien' }, { blocksSales: false }, { status: 'cleared' }, { evidence: {} }])(
    'refuses %o: it never changes after recording',
    (extra) => {
      expect(
        updateEncumbranceInput.safeParse({ id: ID, expectedVersion: 1, ...extra }).success,
      ).toBe(false)
    },
  )
})

describe('requestClearInput', () => {
  it('needs the evidence of clearance, even when recorded in error', () => {
    const r = requestClearInput.safeParse({
      id: ID,
      expectedVersion: 1,
      clearedOn: '2026-11-20',
      note: 'Recorded in error',
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['evidence'])
  })

  it('refuses a status sent with it', () => {
    expect(
      requestClearInput.safeParse({
        id: ID,
        expectedVersion: 1,
        clearedOn: '2026-11-20',
        evidence: { fileId: ID },
        status: 'cleared',
      }).success,
    ).toBe(false)
  })
})

describe('encumbrance dates (security L6)', () => {
  it('refuses a served date before 1900', () => {
    const r = recordEncumbranceInput.safeParse({ ...valid, servedOn: '0202-11-04' })
    expect(messages(r)).toEqual(['Enter a date from 1900 onwards'])
  })

  it('refuses a next date more than a year before the date served', () => {
    const r = recordEncumbranceInput.safeParse({ ...valid, nextOn: '2025-11-03' })
    expect(r.error?.issues[0]?.path).toEqual(['nextOn'])
    expect(recordEncumbranceInput.safeParse({ ...valid, nextOn: '2025-11-04' }).success).toBe(true)
  })

  it('bounds the next date from a year before served to ten years after today', () => {
    expect(nextOnProblem('2036-11-28', '2026-11-04', '2026-11-28')).toBeNull()
    expect(nextOnProblem('2036-11-29', '2026-11-04', '2026-11-28')).toBe(NEXT_ON_TOO_LATE)
    expect(nextOnProblem('2025-11-03', '2026-11-04', '2026-11-28')).toBe(NEXT_ON_TOO_EARLY)
  })

  it('refuses a clearing date before 1900', () => {
    const r = requestClearInput.safeParse({
      id: ID,
      expectedVersion: 1,
      clearedOn: '1899-12-31',
      evidence: { fileId: ID },
    })
    expect(messages(r)).toEqual(['Enter a date from 1900 onwards'])
  })
})
