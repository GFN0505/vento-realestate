import { afterEach, describe, expect, it, vi } from 'vitest'
import { shellUi } from '@/features/shell/shell-ui'
import { testPlan } from '@/test/me'
import { companyLimitReached, openAddCompany } from './open-add-company'

vi.mock('@/features/companies/sheet/company-overlays', () => ({}))

afterEach(() => vi.restoreAllMocks())

describe('Add company', () => {
  it('opens the plan message for an owner whose company places are all taken', () => {
    const open = vi.spyOn(shellUi, 'open').mockImplementation(() => undefined)
    openAddCompany(testPlan({ limits: [{ key: 'entities', included: 2, used: 2 }] }))
    expect(open).toHaveBeenCalledWith('companyPlan')
  })

  it('opens the form for an admin, who has no plan block', () => {
    const company = vi.spyOn(shellUi, 'openCompany').mockImplementation(() => undefined)
    openAddCompany(null)
    expect(company).toHaveBeenCalledWith({ mode: 'add' })
  })

  it('opens the form while there is room, or with no company limit', () => {
    expect(
      companyLimitReached(testPlan({ limits: [{ key: 'entities', included: 3, used: 2 }] })),
    ).toBe(false)
    expect(
      companyLimitReached(testPlan({ limits: [{ key: 'entities', included: null, used: 9 }] })),
    ).toBe(false)
    expect(companyLimitReached(testPlan({ limits: [] }))).toBe(false)
  })
})
