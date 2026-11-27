import { describe, expect, it } from 'vitest'
import { consoleWindow, proofIsFresh } from './console-window'

const now = new Date('2026-11-26T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const session = (openedAgo: number | null, activeAgo: number | null = openedAgo) => ({
  secondFactorAt: null,
  consoleOpenedAt: openedAgo === null ? null : ago(openedAgo),
  consoleActiveAt: activeAgo === null ? null : ago(activeAgo),
})

describe('consoleWindow', () => {
  it('is closed when it was never opened', () => {
    expect(consoleWindow(session(null), now)).toEqual({ open: false })
  })

  it('stays open at 14:59 without activity and closes at 15:00', () => {
    expect(consoleWindow(session(14 * MINUTE + 59 * SECOND), now).open).toBe(true)
    expect(consoleWindow(session(15 * MINUTE), now).open).toBe(false)
  })

  it('stays open at 7:59:59 since opening and closes at 8:00:00, however active', () => {
    expect(consoleWindow(session(8 * HOUR - SECOND, 0), now).open).toBe(true)
    expect(consoleWindow(session(8 * HOUR, 0), now).open).toBe(false)
  })

  it('lets activity extend the idle limit but never the maximum', () => {
    expect(consoleWindow(session(2 * HOUR, MINUTE), now)).toEqual({
      open: true,
      closesAt: new Date(now.getTime() + 14 * MINUTE),
    })
    expect(consoleWindow(session(8 * HOUR - 5 * MINUTE, 0), now)).toEqual({
      open: true,
      closesAt: new Date(now.getTime() + 5 * MINUTE),
    })
  })

  it('reads an opening with no activity yet from when it opened', () => {
    expect(consoleWindow(session(MINUTE, null), now).open).toBe(true)
  })
})

describe('proofIsFresh', () => {
  it('is fresh at 4:59 and stale at 5:01', () => {
    expect(proofIsFresh({ secondFactorAt: ago(4 * MINUTE + 59 * SECOND) }, now)).toBe(true)
    expect(proofIsFresh({ secondFactorAt: ago(5 * MINUTE + SECOND) }, now)).toBe(false)
  })

  it('is never fresh without a proof', () => {
    expect(proofIsFresh({ secondFactorAt: null }, now)).toBe(false)
  })
})
