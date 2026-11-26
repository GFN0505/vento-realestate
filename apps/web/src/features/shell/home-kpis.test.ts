import { defaultPermissions, defaultRole, SYSTEM_ROLE_KEYS } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { HOME_KPIS, homeKpis } from './home-kpis'

const perms = (key: (typeof SYSTEM_ROLE_KEYS)[number]) => defaultPermissions(defaultRole(key))

describe('home numbers', () => {
  it.each(SYSTEM_ROLE_KEYS)('gives %s four numbers it can view', (key) => {
    expect(homeKpis(perms(key), key)).toEqual(HOME_KPIS[key])
    expect(homeKpis(perms(key), key)).toHaveLength(4)
  })

  it('never shows a number from a module the role cannot view', () => {
    const noFinance = { ...perms('owner'), finance: [] }
    expect(homeKpis(noFinance, 'owner').map((k) => k.label)).toEqual(['Overdue', 'Units sold'])
  })

  it('gives a custom role the executive set, filtered', () => {
    expect(homeKpis(perms('sales'), null).map((k) => k.label)).toEqual(['Overdue', 'Units sold'])
  })
})
