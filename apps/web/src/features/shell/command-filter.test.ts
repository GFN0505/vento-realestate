import { describe, expect, it } from 'vitest'
import { commandScore } from './command-filter'

describe('command filter', () => {
  it('ignores case', () => {
    expect(commandScore('Go to Sales', 'SAL')).toBeGreaterThan(0)
  })

  it('ignores word order', () => {
    expect(commandScore('Go to Sales', 'sales go')).toBeGreaterThan(0)
  })

  it('matches on keywords', () => {
    expect(commandScore('Go to Land & title', 'parcels', ['parcels', 'c of o'])).toBeGreaterThan(0)
  })

  it('needs every typed word to match', () => {
    expect(commandScore('Go to Sales', 'sales payroll')).toBe(0)
    expect(commandScore('Go to Sales', 'xyz')).toBe(0)
  })

  it('ranks a label match above a keyword match', () => {
    const label = commandScore('Go to Sales', 'sales')
    const keyword = commandScore('Go to Documents', 'sales', ['sales contracts'])
    expect(label).toBeGreaterThan(keyword)
  })

  it('shows everything when nothing is typed', () => {
    expect(commandScore('Theme: Dark', '  ')).toBeGreaterThan(0)
  })
})
