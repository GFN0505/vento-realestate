import { describe, expect, it } from 'vitest'
import { rangeProblem } from './audit-range'
import { auditListInput, auditRange, validateAuditSearch } from './audit-search'

const now = new Date('2026-11-27T10:00:00.000Z')

describe('audit log address', () => {
  it('shows the last 7 days, today included, when the address has no dates', () => {
    expect(auditRange({}, now)).toEqual({ from: '2026-11-21', to: '2026-11-27' })
  })

  it('refuses a range over a year or backwards, in the schema words', () => {
    expect(rangeProblem({ from: '2025-11-01', to: '2026-11-27' })).toBe(
      'Choose dates up to a year apart',
    )
    expect(rangeProblem({ from: '2026-11-27', to: '2026-11-01' })).toBe(
      'Choose an end date after the start date',
    )
    expect(rangeProblem({ from: '2025-11-27', to: '2026-11-27' })).toBeNull()
  })

  it('ignores hand-edited values it cannot use', () => {
    expect(
      validateAuditSearch({ person: 'aisha', from: '2026-13-40', page: '0', target: 'role' }),
    ).toEqual({
      q: undefined,
      module: undefined,
      person: undefined,
      company: undefined,
      from: undefined,
      to: undefined,
      target: undefined,
      targetId: undefined,
      about: undefined,
      page: undefined,
      open: undefined,
    })
  })

  it('sends View history as the record filter', () => {
    const id = '01900000-0000-7000-8000-0000000000b1'
    const search = validateAuditSearch({ target: 'role', targetId: id, about: 'Site engineer' })
    expect(auditListInput(search, now)).toMatchObject({
      targetType: 'role',
      targetId: id,
      from: '2026-11-21',
      to: '2026-11-27',
      page: 1,
    })
  })
})
