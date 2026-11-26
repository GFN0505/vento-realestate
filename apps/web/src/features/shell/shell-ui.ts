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

export const shellUi = {
  open(overlay: Overlay) {
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

let palettePromise: Promise<typeof import('./command-palette')> | null = null

/** The palette's code. A failed download (offline) is forgotten, so the next attempt refetches. */
export function loadPalette() {
  palettePromise ??= import('./command-palette').catch((error: unknown) => {
    palettePromise = null
    throw error
  })
  return palettePromise
}

/** Starts downloading the palette (on idle after Home, or when the search bar is approached). */
export function preloadPalette(): void {
  loadPalette().catch(() => {
    // Offline or a dropped connection: opening the palette tries again.
  })
}
