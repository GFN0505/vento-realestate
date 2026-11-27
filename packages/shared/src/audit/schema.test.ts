import { describe, expect, it } from 'vitest'
import { listAuditInput } from './schema'

const range = { from: '2026-11-20', to: '2026-11-27' }

describe('listAuditInput', () => {
  it('needs a date range and defaults the page', () => {
    expect(listAuditInput.safeParse({}).success).toBe(false)
    expect(listAuditInput.parse(range)).toMatchObject({ page: 1, pageSize: 25 })
  })

  it('allows a range of up to a year, and no more', () => {
    expect(listAuditInput.safeParse({ from: '2025-11-26', to: '2026-11-27' }).success).toBe(true)
    const r = listAuditInput.safeParse({ from: '2025-11-25', to: '2026-11-27' })
    expect(r.error?.issues.map((i) => i.message)).toEqual(['Choose dates up to a year apart'])
  })

  it('refuses an end before the start', () => {
    const r = listAuditInput.safeParse({ from: '2026-11-27', to: '2026-11-20' })
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'Choose an end date after the start date',
    ])
  })

  it('refuses unknown filters', () => {
    expect(listAuditInput.safeParse({ ...range, action: 'role.updated' }).success).toBe(false)
  })
})
