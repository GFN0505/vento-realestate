import { describe, expect, it } from 'vitest'
import { routeModule } from './route-module'

type Matches = Parameters<typeof routeModule>[0]

describe('route module', () => {
  it('takes the module from the page route', () => {
    expect(routeModule([{}, {}, { staticData: { module: 'sales' } }])).toBe('sales')
  })

  it('keeps the parent module for a nested child route without its own', () => {
    const matches: Matches = [
      {},
      { staticData: {} },
      { staticData: { module: 'sales' } },
      { staticData: {} },
    ]
    expect(routeModule(matches)).toBe('sales')
  })

  it('prefers the deepest route that declares one', () => {
    expect(
      routeModule([{ staticData: { module: 'projects' } }, { staticData: { module: 'finance' } }]),
    ).toBe('finance')
  })

  it('has no module on Home', () => {
    expect(routeModule([{}, {}])).toBeUndefined()
  })
})
