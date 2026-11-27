import { useSyncExternalStore } from 'react'

/*
 * Whether the console window is open on this session (plan §9.3). Requests that come back
 * NOT_FOUND `console_window_closed` park here until the person confirms it's them, then run
 * again with the same input (same idempotency key, so a change can't apply twice).
 */

export type GateState =
  /** `access.status` hasn't answered yet. */
  | { kind: 'checking' }
  | { kind: 'open' }
  /** `entry`: on arrival, a page-level card. `expired`: mid-task, a dialog over the page. */
  | { kind: 'asking'; mode: 'entry' | 'expired' }
  /** The super-admin's two-step is off (reset by an owner): set it up again first. */
  | { kind: 'two_step' }

let state: GateState = { kind: 'checking' }
let wasOpen = false
let waiters: Array<(proved: boolean) => void> = []
const listeners = new Set<() => void>()

function set(next: GateState) {
  state = next
  for (const listener of listeners) listener()
}

function settle(proved: boolean) {
  const pending = waiters
  waiters = []
  for (const resolve of pending) resolve(proved)
}

export const consoleGate = {
  get: (): GateState => state,
  isOpen: () => state.kind === 'open',
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Ask for a proof. Resolves true once it's given, false if the person backs out. */
  prove(): Promise<boolean> {
    if (state.kind === 'two_step') return Promise.resolve(false)
    if (state.kind !== 'asking') set({ kind: 'asking', mode: wasOpen ? 'expired' : 'entry' })
    return new Promise((resolve) => waiters.push(resolve))
  },
  /** The window is open: parked requests run again. */
  opened() {
    wasOpen = true
    set({ kind: 'open' })
    settle(true)
  },
  /** The person closed the mid-task dialog: parked requests fail with their own error. */
  dismissed() {
    set({ kind: 'open' })
    settle(false)
  },
  twoStepMissing() {
    set({ kind: 'two_step' })
    settle(false)
  },
  /** Leaving the console (sign-out, back to an organization) or a test. */
  reset() {
    wasOpen = false
    settle(false)
    set({ kind: 'checking' })
  },
}

export function useConsoleGate(): GateState {
  return useSyncExternalStore(consoleGate.subscribe, consoleGate.get, consoleGate.get)
}
