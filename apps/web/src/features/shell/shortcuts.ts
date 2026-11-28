/*
 * The one shortcut registry. The key listener and the `?` dialog both read it, so later bricks
 * add a shortcut by adding an entry. Decision 12: never add a shortcut to a module here without
 * gating it on the role's view permission.
 */

export type ShortcutId =
  | 'palette'
  | 'help'
  | 'sidebar'
  | 'home'
  | 'team-invite'
  | 'team-search'
  | 'companies-add'
  | 'land-add'
  | 'roles-new'
  | 'approvals-next'
  | 'approvals-previous'
  | 'approvals-approve'
  | 'approvals-comment'

/**
 * Shortcuts that belong to one page are announced with this window event (detail: the id); the
 * page decides what it means, with its own permissions (the Team page: `i` and `/`).
 */
export const PAGE_SHORTCUT_EVENT = 'vento:page-shortcut'

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
  /** Only on this page; the `?` dialog lists it under the page's name. */
  page?: { path: string; name: string }
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
  {
    id: 'team-invite',
    label: 'Invite people',
    keys: ['I'],
    trigger: { kind: 'key', key: 'i' },
    allowInFields: false,
    page: { path: '/settings/team', name: 'Team' },
  },
  {
    id: 'team-search',
    label: 'Search the team',
    keys: ['/'],
    trigger: { kind: 'key', key: '/' },
    allowInFields: false,
    page: { path: '/settings/team', name: 'Team' },
  },
  {
    id: 'companies-add',
    label: 'Add company',
    keys: ['N'],
    trigger: { kind: 'key', key: 'n' },
    allowInFields: false,
    page: { path: '/settings/companies', name: 'Companies' },
  },
  {
    id: 'land-add',
    label: 'Add parcel',
    keys: ['N'],
    trigger: { kind: 'key', key: 'n' },
    allowInFields: false,
    page: { path: '/land', name: 'Land & title' },
  },
  {
    id: 'roles-new',
    label: 'New role',
    keys: ['N'],
    trigger: { kind: 'key', key: 'n' },
    allowInFields: false,
    page: { path: '/settings/roles', name: 'Roles & permissions' },
  },
  ...(
    [
      ['approvals-next', 'Next request', 'J'],
      ['approvals-previous', 'Previous request', 'K'],
      ['approvals-approve', 'Approve', 'A'],
      ['approvals-comment', 'Write a comment', 'R'],
    ] as const
  ).map(
    ([id, label, key]): Shortcut => ({
      id,
      label,
      keys: [key],
      trigger: { kind: 'key', key: key.toLowerCase() },
      allowInFields: false,
      page: { path: '/approvals', name: 'Approvals' },
    }),
  ),
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

  /**
   * `pathname`: the page the key was pressed on. Page shortcuts only match there, so two pages
   * can give the same key different meanings (`n` on Companies and on Roles). Without it, any.
   */
  return function match(event: KeyInput, pathname?: string): ShortcutId | null {
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
      if (s.trigger.kind !== 'key' || key !== s.trigger.key) continue
      if (s.page && pathname !== undefined && s.page.path !== pathname) continue
      return s.id
    }
    if (shortcuts.some((s) => s.trigger.kind === 'sequence' && s.trigger.keys[0] === key)) {
      pending = { key, at: now() }
    }
    return null
  }
}
