import { describe, expect, it } from 'vitest'
import { createShortcutMatcher, type KeyInput, SEQUENCE_WINDOW_MS } from './shortcuts'

function press(key: string, init: Partial<KeyInput> = {}): KeyInput {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isComposing: false,
    target: document.body,
    ...init,
  }
}

function field(tag: 'input' | 'textarea' | 'div') {
  const el = document.createElement(tag)
  if (tag === 'div') el.setAttribute('contenteditable', 'true')
  document.body.append(el)
  return el
}

describe('shortcuts', () => {
  it('opens the palette with Cmd K or Ctrl K, even inside a field', () => {
    const match = createShortcutMatcher()
    expect(match(press('k', { metaKey: true }))).toBe('palette')
    expect(match(press('K', { ctrlKey: true, target: field('input') }))).toBe('palette')
  })

  it('maps ? and [ outside fields', () => {
    const match = createShortcutMatcher()
    expect(match(press('?'))).toBe('help')
    expect(match(press('['))).toBe('sidebar')
  })

  it.each(['input', 'textarea', 'div'] as const)(
    'ignores single keys while typing in a %s',
    (tag) => {
      const match = createShortcutMatcher()
      const target = field(tag)
      expect(match(press('?', { target }))).toBeNull()
      expect(match(press('g', { target }))).toBeNull()
      expect(match(press('h', { target }))).toBeNull()
    },
  )

  it('ignores keys while an input method is composing', () => {
    const match = createShortcutMatcher()
    expect(match(press('k', { metaKey: true, isComposing: true }))).toBeNull()
  })

  it('ignores single keys pressed with a modifier', () => {
    const match = createShortcutMatcher()
    expect(match(press('[', { ctrlKey: true }))).toBeNull()
  })

  it('goes home on g then h within a second', () => {
    let now = 0
    const match = createShortcutMatcher(undefined, () => now)
    expect(match(press('g'))).toBeNull()
    now = SEQUENCE_WINDOW_MS - 1
    expect(match(press('h'))).toBe('home')
  })

  it('forgets g after the window passes or another key comes between', () => {
    let now = 0
    const match = createShortcutMatcher(undefined, () => now)
    match(press('g'))
    now = SEQUENCE_WINDOW_MS + 1
    expect(match(press('h'))).toBeNull()
    match(press('g'))
    match(press('x'))
    expect(match(press('h'))).toBeNull()
  })
})
