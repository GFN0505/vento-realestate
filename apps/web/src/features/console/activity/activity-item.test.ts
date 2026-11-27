import { describe, expect, it } from 'vitest'
import { changeWords } from './activity-item'

describe('what changed, in words', () => {
  it('names stages and groups, and says "Not set" for nothing', () => {
    expect(changeWords('internal → pilot')).toBe('Internal → Pilot')
    expect(changeWords('none → on')).toBe('Not set → On')
  })

  it('shows nothing when before and after are the same', () => {
    expect(changeWords('internal → internal')).toBeNull()
    expect(changeWords(null)).toBeNull()
  })

  it('keeps plan names and amounts as they are', () => {
    expect(changeWords('Starter v1 → Growth v1')).toBe('Starter v1 → Growth v1')
  })
})
