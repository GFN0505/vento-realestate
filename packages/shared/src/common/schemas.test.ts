import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Decimal, toMoneyString } from './decimal'
import { money, signedMoney } from './money'
import { id, isoDate, paginated, paginationInput } from './schemas'

describe('money', () => {
  it('normalises whole amounts to two decimal places', () => {
    expect(money.parse('1250000')).toBe('1250000.00')
  })

  it('keeps kobo exactly', () => {
    expect(money.parse('0.10')).toBe('0.10')
    expect(money.parse('85000000.5')).toBe('85000000.50')
  })

  it('accepts zero but rejects negative amounts', () => {
    expect(money.parse('0')).toBe('0.00')
    expect(money.safeParse('-2500000').success).toBe(false)
  })

  it('allows negative amounts only through signedMoney', () => {
    expect(signedMoney.parse('-2500000')).toBe('-2500000.00')
    expect(signedMoney.parse('-0')).toBe('0.00')
  })

  it('rejects numbers, more than two decimals and amounts too large for numeric(14,2)', () => {
    expect(money.safeParse(1250000).success).toBe(false)
    expect(money.safeParse('1.005').success).toBe(false)
    expect(money.safeParse('1000000000000').success).toBe(false)
    expect(money.safeParse('₦5,000').success).toBe(false)
  })

  it('explains the expected format in plain English', () => {
    const result = money.safeParse('abc')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Enter an amount like 1250000 or 1250000.50')
  })
})

describe('Decimal', () => {
  it('adds money without floating-point error', () => {
    expect(new Decimal('0.1').plus('0.2').toFixed(2)).toBe('0.30')
  })

  it('rounds half up to the kobo', () => {
    expect(toMoneyString(new Decimal('2.345'))).toBe('2.35')
    expect(toMoneyString('2.344')).toBe('2.34')
  })

  it('never produces negative zero', () => {
    expect(toMoneyString('-0.001')).toBe('0.00')
  })

  it('refuses amounts too large for numeric(14,2), including after rounding', () => {
    expect(toMoneyString('999999999999.99')).toBe('999999999999.99')
    expect(() => toMoneyString('999999999999.999')).toThrow(RangeError)
  })
})

describe('id', () => {
  it('accepts a UUID v7 and rejects other versions', () => {
    expect(id.safeParse('01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f').success).toBe(true)
    expect(id.safeParse('3f2504e0-4f89-41d3-9a0c-0305e82c3301').success).toBe(false)
  })
})

describe('isoDate', () => {
  it('accepts a calendar date and rejects impossible ones', () => {
    expect(isoDate.safeParse('2028-02-29').success).toBe(true)
    expect(isoDate.safeParse('2026-02-30').success).toBe(false)
  })
})

describe('pagination', () => {
  it('defaults to page 1 of 25', () => {
    expect(paginationInput.parse({})).toEqual({ page: 1, pageSize: 25 })
  })

  it('caps page size at 100', () => {
    expect(paginationInput.safeParse({ pageSize: 101 }).success).toBe(false)
  })

  it('caps the page at 10,000', () => {
    expect(paginationInput.safeParse({ page: 10_000 }).success).toBe(true)
    expect(paginationInput.safeParse({ page: 10_001 }).success).toBe(false)
  })

  it('describes list output as items, page, pageSize and total', () => {
    const list = paginated(z.object({ name: z.string() }))
    const page = { items: [{ name: 'A-14' }], page: 1, pageSize: 25, total: 1 }
    expect(list.parse(page)).toEqual(page)
  })
})
