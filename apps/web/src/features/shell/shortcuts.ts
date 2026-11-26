/*
 * The one shortcut registry. The key listener and the `?` dialog both read it, so later bricks
 * add a shortcut by adding an entry. Decision 12: never add a shortcut to a module here without
 * gating it on the role's view permission.
 */

export type ShortcutId = 'palette' | 'help' | 'sidebar' | 'home'

type Trigger =
  | { kind: 'mod'; key: string }
  | { kind: 'key'; key: string }
  | { kind: 'sequence'; keys: readonly [string, string] }

export type Shortcut = {
  id: ShortcutId
  label: string
  /** How the `?` dialog writes it; "mod" becomes ⌘ or Ctrl. */
  keys: readonly string[]
  trigger: Trigger
  /** Only ⌘K works while typing in a field. */
  allowInFields: boolean
  /** Only on screens with a sidebar to collapse. */
  desktopOnly?: boolean
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'palette',
    label: 'Search or run a command',
    keys: ['mod', 'K'],
    trigger: { kind: 'mod', key: 'k' },
    allowInFields: true,
  },
  {
    id: 'help',
    label: 'Show shortcuts',
    keys: ['?'],
    trigger: { kind: 'key', key: '?' },
    allowInFields: false,
  },
  {
    id: 'sidebar',
    label: 'Collapse sidebar',
    keys: ['['],
    trigger: { kind: 'key', key: '[' },
    allowInFields: false,
    desktopOnly: true,
  },
  {
    id: 'home',
    label: 'Go to home',
    keys: ['G', 'then', 'H'],
    trigger: { kind: 'sequence', keys: ['g', 'h'] },
    allowInFields: false,
  },
]

/** Listed in the `?` dialog but handled by each dialog and menu (Radix). */
export const CLOSE_SHORTCUT = { label: 'Close', keys: ['Esc'] } as const

/** How long the second key of a sequence ("g then h") may wait. */
export const SEQUENCE_WINDOW_MS = 1000

export type KeyInput = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'isComposing' | 'target'
>

/** True while someone is typing: single-key shortcuts must never steal those keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  // `closest` too: jsdom and some editors leave isContentEditable unset on nested nodes.
  if (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])')
  ) {
    return true
  }
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
      target.type,
    )
  }
  return target.getAttribute('role') === 'textbox' || target.getAttribute('role') === 'combobox'
}

/** Turns key presses into shortcut ids. Keeps the first key of a sequence for a moment. */
export function createShortcutMatcher(
  shortcuts: readonly Shortcut[] = SHORTCUTS,
  now: () => number = Date.now,
) {
  let pending: { key: string; at: number } | null = null

  return function match(event: KeyInput): ShortcutId | null {
    if (event.isComposing) return null
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const typing = isTypingTarget(event.target)

    for (const s of shortcuts) {
      if (
        s.trigger.kind === 'mod' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        key === s.trigger.key
      ) {
        if (typing && !s.allowInFields) return null
        pending = null
        return s.id
      }
    }

    // Single keys: never while typing, never with a modifier (Shift is part of "?").
    if (typing || event.metaKey || event.ctrlKey || event.altKey) {
      pending = null
      return null
    }

    const previous = pending
    pending = null
    for (const s of shortcuts) {
      if (s.trigger.kind !== 'sequence') continue
      const [first, second] = s.trigger.keys
      if (previous?.key === first && key === second && now() - previous.at <= SEQUENCE_WINDOW_MS) {
        return s.id
      }
    }
    for (const s of shortcuts) {
      if (s.trigger.kind === 'key' && key === s.trigger.key) return s.id
    }
    if (shortcuts.some((s) => s.trigger.kind === 'sequence' && s.trigger.keys[0] === key)) {
      pending = { key, at: now() }
    }
    return null
  }
}
