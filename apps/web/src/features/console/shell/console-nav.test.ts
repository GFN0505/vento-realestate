import { describe, expect, it } from 'vitest'
import { CONSOLE_MORE, CONSOLE_NAV, CONSOLE_TABS, isCurrent } from './console-nav'

const current = (pathname: string) =>
  CONSOLE_NAV.filter((item) => isCurrent(item, pathname)).map((item) => item.key)

describe('console navigation', () => {
  it('starts at the Dashboard and shows only built sections', () => {
    expect(CONSOLE_NAV.map((i) => i.label)).toEqual([
      'Dashboard',
      'Organizations',
      'Releases',
      'Plans',
      'Activity',
      'Super-admins',
    ])
    expect(CONSOLE_TABS.map((i) => i.label)).toEqual(['Dashboard', 'Organizations', 'Releases'])
    expect(CONSOLE_MORE.map((i) => i.label)).toEqual(['Plans', 'Activity', 'Super-admins'])
  })

  it('marks one section, detail pages included, and the Dashboard only at /console', () => {
    expect(current('/console')).toEqual(['dashboard'])
    expect(current('/console/organizations')).toEqual(['organizations'])
    expect(current('/console/organizations/019a')).toEqual(['organizations'])
    expect(current('/console/releases/sales')).toEqual(['releases'])
    expect(current('/console/account')).toEqual([])
  })
})
