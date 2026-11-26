import { useSyncExternalStore } from 'react'

/*
 * Which shell overlays are open: the ⌘K palette, the `?` shortcuts dialog and the Invite people
 * sheet. A tiny store so the key listener, the top bar, Home, Team and ⌘K can all open them.
 */

type Overlay = 'palette' | 'shortcuts' | 'invite'
type State = Readonly<Record<Overlay, boolean>>

/** What "Invite again" fills in: the removed person's email and the role they had. */
export type InvitePrefill = { emails: readonly string[]; roleId?: string }

let state: State = { palette: false, shortcuts: false, invite: false }
let prefill: InvitePrefill | null = null
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export const shellUi = {
  open(overlay: Overlay) {
    // One overlay at a time: opening one closes the others.
    set({
      palette: overlay === 'palette',
      shortcuts: overlay === 'shortcuts',
      invite: overlay === 'invite',
    })
  },
  /** Invite people, from Team, Home's checklist or ⌘K; optionally with rows filled in. */
  openInvite(fill?: InvitePrefill) {
    prefill = fill ?? null
    preloadInvite()
    shellUi.open('invite')
  },
  /** The sheet takes the prefill once, when it opens. */
  takeInvitePrefill(): InvitePrefill | null {
    const taken = prefill
    prefill = null
    return taken
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

let invitePromise: Promise<typeof import('@/features/team/invite/invite-sheet')> | null = null

/** The invite sheet's code, shared by every Invite people button. A failed download is retried. */
export function loadInvite() {
  invitePromise ??= import('@/features/team/invite/invite-sheet').catch((error: unknown) => {
    invitePromise = null
    throw error
  })
  return invitePromise
}

/** Starts downloading the sheet when someone heads for an Invite people button. */
export function preloadInvite(): void {
  loadInvite().catch(() => {
    // Offline: opening the sheet tries again.
  })
}
