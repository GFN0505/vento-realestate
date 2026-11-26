import { useSyncExternalStore } from 'react'

/*
 * Which shell overlays are open: the ⌘K palette and the `?` shortcuts dialog. A tiny store so the
 * key listener, the top bar, the 404 page and the More sheet can all open them.
 */

type Overlay = 'palette' | 'shortcuts'
type State = Readonly<Record<Overlay, boolean>>

let state: State = { palette: false, shortcuts: false }
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

let paletteMounted = false

/** Called once by the palette when it first mounts. */
export function markPaletteMounted() {
  paletteMounted = true
  document.documentElement.removeAttribute('data-palette-pending')
}

export const shellUi = {
  open(overlay: Overlay) {
    // Until the palette's code arrives, keys typed for it are buffered (useShortcuts).
    if (overlay === 'palette' && !paletteMounted) {
      document.documentElement.setAttribute('data-palette-pending', '')
    }
    // One overlay at a time: opening one closes the other.
    set({ palette: overlay === 'palette', shortcuts: overlay === 'shortcuts' })
  },
  close(overlay: Overlay) {
    set({ [overlay]: false })
  },
  toggle(overlay: Overlay) {
    if (state[overlay]) set({ [overlay]: false })
    else shellUi.open(overlay)
  },
}

export function useOverlay(overlay: Overlay): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state[overlay],
    () => false,
  )
}

/*
 * Keys typed after ⌘K but before the palette's code has arrived (a slow phone, first open) are
 * kept here and handed to the palette when it mounts, so nothing typed is lost.
 */
let earlyQuery = ''

export function bufferPaletteKey(key: string) {
  earlyQuery = key === 'Backspace' ? earlyQuery.slice(0, -1) : earlyQuery + key
}

export function takeEarlyQuery(): string {
  const query = earlyQuery
  earlyQuery = ''
  return query
}

let palettePromise: Promise<typeof import('./command-palette')> | null = null

/** Starts downloading the palette (on idle after Home, or when the search bar is hovered). */
export function loadPalette() {
  palettePromise ??= import('./command-palette')
  return palettePromise
}
