import { describe, expect, it } from 'vitest'
import { lastActiveLabel } from './last-active'

// 23:30 UTC on 25 Nov is already 26 Nov in Lagos (UTC+1).
const now = new Date('2026-11-25T23:30:00Z')

describe('lastActiveLabel', () => {
  it('reads the Lagos day, not the UTC day', () => {
    expect(lastActiveLabel('2026-11-25T23:10:00Z', now)).toBe('Today')
    expect(lastActiveLabel('2026-11-25T22:50:00Z', now)).toBe('Yesterday')
  })

  it('counts days for the past week, then shows the date', () => {
    expect(lastActiveLabel('2026-11-23T10:00:00Z', now)).toBe('3 days ago')
    expect(lastActiveLabel('2026-11-12T10:00:00Z', now)).toBe('12 Nov 2026')
  })

  it('says so when someone has never signed in', () => {
    expect(lastActiveLabel(null, now)).toBe('Not yet')
  })
})
