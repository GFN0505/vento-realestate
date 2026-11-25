import { useSyncExternalStore } from 'react'

/*
 * When the API says the session ended, the page stays mounted (so typed input survives) and
 * a dialog asks the person to sign in again. This tiny store is the switch for that dialog;
 * the query client turns it on and the dialog turns it off.
 */

let open = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export const sessionExpired = {
  open() {
    if (open) return
    open = true
    emit()
  },
  close() {
    if (!open) return
    open = false
    emit()
  },
  isOpen: () => open,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useSessionExpired(): boolean {
  return useSyncExternalStore(sessionExpired.subscribe, sessionExpired.isOpen, () => false)
}
