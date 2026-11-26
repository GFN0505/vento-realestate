import { describe, expect, it } from 'vitest'
import { ERROR_REFERENCE_PATTERN, errorReference } from './reference'

describe('errorReference', () => {
  it('uses the first four hex digits of the request id and the Lagos date', () => {
    const ref = errorReference(
      '7f3a91c2-0b4e-4c1d-9a2b-3c4d5e6f7a8b',
      new Date('2026-11-26T10:00:00Z'),
    )
    expect(ref).toBe('ERR-7F3A-1126')
    expect(ref).toMatch(ERROR_REFERENCE_PATTERN)
  })

  it('takes the date in Lagos time, which is an hour ahead of UTC', () => {
    expect(errorReference('abcd', new Date('2026-12-31T23:30:00Z'))).toBe('ERR-ABCD-0101')
  })

  it('pads an id with too few hex digits so the format still holds', () => {
    expect(errorReference('test', new Date('2026-03-05T12:00:00Z'))).toBe('ERR-E000-0305')
  })
})
