import { describe, expect, it } from 'vitest'
import { CONSOLE_NAV, isCurrent } from './console-nav'

const current = (pathname: string) =>
  CONSOLE_NAV.filter((item) => isCurrent(item, pathname)).map((item) => item.key)

describe('console navigation', () => {
  it('shows only built sections', () => {
    expect(CONSOLE_NAV.map((i) => i.label)).toEqual([
      'Organizations',
      'Releases',
      'Plans',
      'Activity',
      'Super-admins',
    ])
  })

  it('marks one section, detail pages included', () => {
    expect(current('/console')).toEqual(['organizations'])
    expect(current('/console/organizations/019a')).toEqual(['organizations'])
    expect(current('/console/releases/sales')).toEqual(['releases'])
    expect(current('/console/super-admins')).toEqual(['super-admins'])
  })
})
