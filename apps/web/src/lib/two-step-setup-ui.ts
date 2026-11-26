import { useSyncExternalStore } from 'react'

/*
 * "Set up two-step" over the page, opened from the banner (3d). When two-step is *required*
 * the sheet follows `me.nextStep` instead (see TwoStepSetupHost), so it can never be left open
 * once `me` says the person is ready. Tiny on purpose: the shell's first load carries it.
 */

let open = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

export const twoStepSetupUi = {
  open: () => set(true),
  close: () => set(false),
  isOpen: () => open,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useTwoStepSetupOffered(): boolean {
  return useSyncExternalStore(twoStepSetupUi.subscribe, twoStepSetupUi.isOpen, () => false)
}
