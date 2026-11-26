import { useSyncExternalStore } from 'react'

/*
 * "Set up two-step" over the page (3d). The banner opens it as an offer; when two-step becomes
 * required while someone is working (the 7 days ran out, a request was refused), it opens as
 * required instead of sending them to the setup page, so nothing they typed is lost. Tiny on
 * purpose: the shell's first load carries it; the sheet itself loads on first open.
 */

export type TwoStepSetupMode = 'offer' | 'required'

let mode: TwoStepSetupMode | null = null
const listeners = new Set<() => void>()

function set(next: TwoStepSetupMode | null) {
  if (mode === next) return
  mode = next
  for (const listener of listeners) listener()
}

export const twoStepSetupUi = {
  /** "required" wins over an open offer. */
  open: (next: TwoStepSetupMode) => set(mode === 'required' ? 'required' : next),
  close: () => set(null),
  mode: () => mode,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useTwoStepSetupMode(): TwoStepSetupMode | null {
  return useSyncExternalStore(twoStepSetupUi.subscribe, twoStepSetupUi.mode, () => null)
}
