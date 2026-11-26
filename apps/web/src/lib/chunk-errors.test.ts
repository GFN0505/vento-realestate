import { afterEach, describe, expect, it } from 'vitest'
import { chunkFailureAction, takeOverChunkReloads } from './chunk-errors'

afterEach(() => sessionStorage.clear())

describe('chunk load failures', () => {
  it('shows the offline page when offline, never a reload', () => {
    expect(chunkFailureAction({ online: false, lastReloadAt: null, now: 0 })).toBe('offline')
  })

  it('reloads once when online (a new deploy changed the file names)', () => {
    expect(chunkFailureAction({ online: true, lastReloadAt: null, now: 1_000_000 })).toBe('reload')
  })

  it('does not reload again within a minute, so it can never loop', () => {
    expect(chunkFailureAction({ online: true, lastReloadAt: 1_000_000, now: 1_030_000 })).toBe(
      'give_up',
    )
    expect(chunkFailureAction({ online: true, lastReloadAt: 1_000_000, now: 1_061_000 })).toBe(
      'reload',
    )
  })

  it("answers TanStack's reload check as done, so its lazy route throws to our boundary", () => {
    takeOverChunkReloads(sessionStorage)
    expect(
      sessionStorage.getItem(
        'tanstack_router_reload:Failed to fetch dynamically imported module: /x.js',
      ),
    ).toBe('1')
  })

  it('leaves every other key alone', () => {
    takeOverChunkReloads(sessionStorage)
    takeOverChunkReloads(sessionStorage) // idempotent
    expect(sessionStorage.getItem('vento-preview')).toBeNull()
    sessionStorage.setItem('vento-tab-org', 'x')
    expect(sessionStorage.getItem('vento-tab-org')).toBe('x')
    expect(localStorage.getItem('tanstack_router_reload:anything')).toBeNull()
  })
})
