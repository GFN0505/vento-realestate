import type { PasskeyItem } from '@vento/shared'
import { useSyncExternalStore } from 'react'

/*
 * My security's open dialog, the passkey being renamed and a pending "Confirm it's you". Kept
 * outside React so a card refetching, the page remounting or the "Session expired" dialog never
 * closes something a person is typing in (lesson from 3c: state that must survive lives outside
 * remounting components).
 */

export type SecurityDialog =
  | { name: 'change-password' }
  | { name: 'turn-on' }
  | { name: 'turn-off' }
  | { name: 'new-codes' }
  | { name: 'remove-passkey'; passkey: PasskeyItem }
  | { name: 'sign-out-others'; count: number }

type State = {
  dialog: SecurityDialog | null
  /** The passkey whose name is being edited in place. */
  renaming: string | null
  /** "Confirm it's you" is open; resolves true once the password is confirmed. */
  confirm: ((confirmed: boolean) => void) | null
}

let state: State = { dialog: null, renaming: null, confirm: null }
const listeners = new Set<() => void>()

function update(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const securityUi = {
  open: (dialog: SecurityDialog) => update({ dialog }),
  close: () => update({ dialog: null }),
  rename: (id: string | null) => update({ renaming: id }),
  /** Opens "Confirm it's you"; true once confirmed, false when cancelled. */
  confirm(): Promise<boolean> {
    state.confirm?.(false)
    return new Promise((resolve) => update({ confirm: resolve }))
  },
  settleConfirm(confirmed: boolean) {
    const resolve = state.confirm
    update({ confirm: null })
    resolve?.(confirmed)
  },
  /** Tests start clean. */
  reset: () => update({ dialog: null, renaming: null, confirm: null }),
}

export function useSecurityUi<T>(select: (state: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  )
}
