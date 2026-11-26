import { describe, expect, it } from 'vitest'
import { saveBarLine } from './role-save-bar'

describe('save bar', () => {
  it('says how many changes and who they reach', () => {
    expect(saveBarLine(3, 4)).toBe('3 changes · applies to 4 people on their next click')
    expect(saveBarLine(1, 1)).toBe('1 change · applies to 1 person on their next click')
  })

  it('says when nobody has the role yet', () => {
    expect(saveBarLine(3, 0)).toBe('3 changes · applies to nobody yet')
  })
})
