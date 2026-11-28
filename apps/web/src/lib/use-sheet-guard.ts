import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { isReloading } from './reload'

const sheetOf = (search: unknown) => (search as { sheet?: unknown } | undefined)?.sheet

export type SheetGuard = {
  /** The "Discard?" confirm is showing (from Cancel, Esc, Back or a link). */
  asking: boolean
  /** Cancel or Esc on a dirty sheet. */
  ask: () => void
  /** Stay; a held navigation is dropped. */
  keepEditing: () => void
  /** Lose the changes: a held navigation goes ahead, otherwise `close` runs. */
  discard: (close: () => void) => void
  /** Saved: closing no longer asks. */
  release: () => void
}

/**
 * Asks before a dirty sheet goes away by any route: its own Cancel, Back (the `sheet` param
 * disappears), a link to another page, or closing the tab (the browser's own prompt). The same
 * Discard confirm answers all of them, and refusing keeps every field and file.
 */
export function useSheetGuard(dirty: boolean): SheetGuard {
  const [askingHere, setAskingHere] = useState(false)
  const released = useRef(false)
  const live = () => dirty && !released.current
  // A sheet that stays mounted between openings guards each fresh form again.
  useEffect(() => {
    if (!dirty) released.current = false
  }, [dirty])
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      live() &&
      (current.pathname !== next.pathname || sheetOf(current.search) !== sheetOf(next.search)),
    enableBeforeUnload: () => live() && !isReloading(),
    withResolver: true,
  })
  const held = blocker.status === 'blocked'

  return {
    asking: askingHere || held,
    ask: () => setAskingHere(true),
    keepEditing: () => {
      setAskingHere(false)
      blocker.reset?.()
    },
    discard: (close) => {
      released.current = true
      setAskingHere(false)
      if (held) blocker.proceed?.()
      else close()
    },
    release: () => {
      released.current = true
    },
  }
}
