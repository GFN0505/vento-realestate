import type { Entity } from '@vento/shared'
import { useSyncExternalStore } from 'react'

/*
 * Which shell overlays are open: the ⌘K palette, the `?` shortcuts dialog, the Invite people
 * sheet, the Company sheet and the company plan message. A tiny store so the key listener, the
 * top bar, Home, Settings and ⌘K can all open them.
 */

export type Overlay = 'palette' | 'shortcuts' | 'invite' | 'company' | 'companyPlan'
type State = Readonly<Record<Overlay, boolean>>

/** What "Invite again" fills in: the removed person's email and the role they had. */
export type InvitePrefill = { emails: readonly string[]; roleId?: string }

/** What the Company sheet shows: a new company, or one from a list (its latest copy). */
export type CompanyTarget = { mode: 'add' } | { mode: 'edit'; company: Entity }

const CLOSED: State = {
  palette: false,
  shortcuts: false,
  invite: false,
  company: false,
  companyPlan: false,
}

let state: State = CLOSED
let prefill: InvitePrefill | null = null
let companyTarget: CompanyTarget = { mode: 'add' }
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export const shellUi = {
  open(overlay: Overlay) {
    // One overlay at a time: opening one closes the others.
    set({ ...CLOSED, [overlay]: true })
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
  /** The Company sheet, to add one or edit one. Use `openAddCompany` for every Add button. */
  openCompany(target: CompanyTarget) {
    companyTarget = target
    preloadCompanySheet()
    shellUi.open('company')
  },
  companyTarget(): CompanyTarget {
    return companyTarget
  },
  isOpen(overlay: Overlay): boolean {
    return state[overlay]
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

let companyPromise: Promise<typeof import('@/features/companies/sheet/company-overlays')> | null =
  null

/** The Company sheet and the plan message: one chunk, shared by every Add company button. */
export function loadCompanySheet() {
  companyPromise ??= import('@/features/companies/sheet/company-overlays').catch(
    (error: unknown) => {
      companyPromise = null
      throw error
    },
  )
  return companyPromise
}

/** Starts downloading the sheet when someone heads for an Add company button or a company row. */
export function preloadCompanySheet(): void {
  loadCompanySheet().catch(() => {
    // Offline: opening the sheet tries again.
  })
}
