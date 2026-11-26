import { defaultPermissions, defaultRole, SYSTEM_ROLE_KEYS } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { NAV_FLAGS, navAccess } from '@/test/nav-access'
import { HOME_KPIS, homeKpis, kpiNote } from './home-kpis'

const perms = (key: (typeof SYSTEM_ROLE_KEYS)[number]) => defaultPermissions(defaultRole(key))
// An internal organization with every module: the 3a behaviour.
const all = (key: (typeof SYSTEM_ROLE_KEYS)[number]) => navAccess(perms(key))

describe('home numbers', () => {
  it.each(SYSTEM_ROLE_KEYS)('gives %s four numbers it can view', (key) => {
    expect(homeKpis(all(key), key)).toEqual(HOME_KPIS[key])
    expect(homeKpis(all(key), key)).toHaveLength(4)
  })

  it('never shows a number from a module the role cannot view, and still shows four', () => {
    const noFinance = { ...perms('owner'), finance: [] }
    const labels = homeKpis(navAccess(noFinance), 'owner').map((k) => k.label)
    expect(labels).toHaveLength(4)
    expect(labels.slice(0, 2)).toEqual(['Overdue', 'Units sold'])
    expect(homeKpis(navAccess(noFinance), 'owner').every((k) => k.module !== 'finance')).toBe(true)
  })

  it('gives a custom role four tiles from what it can view', () => {
    const kpis = homeKpis(all('sales'), null)
    expect(kpis).toHaveLength(4)
    expect(kpis.every((k) => perms('sales')[k.module].includes('view'))).toBe(true)
  })

  it('shows nothing to someone who can view no modules', () => {
    expect(homeKpis(navAccess(null), null)).toEqual([])
  })

  it('never shows a number from a module the organization does not have', () => {
    const noFinance = navAccess(perms('owner'), {
      features: NAV_FLAGS.filter((f) => f !== 'finance'),
    })
    expect(homeKpis(noFinance, 'owner').every((k) => k.module !== 'finance')).toBe(true)
    expect(homeKpis(navAccess(perms('owner'), { internal: false }), 'owner')).toEqual([])
  })

  it('names the modules the numbers wait for', () => {
    const label = (m: string) => (m === 'finance' ? 'Finance' : 'Sales')
    expect(kpiNote(HOME_KPIS.owner, label)).toBe('Numbers appear as Finance and Sales go live.')
    expect(kpiNote(HOME_KPIS.sales, label)).toBe('Numbers appear as Sales goes live.')
    expect(kpiNote([], label)).toBeNull()
  })
})
