import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

export type UnsavedGuard = {
  /** True while a navigation waits for the person to choose. */
  asking: boolean
  /** Leave and lose the changes. */
  discard: () => void
  /** Stay on the page; the navigation is dropped. */
  keepEditing: () => void
}

/**
 * Asks before leaving a page with unsaved changes (spec: "Discard changes to Organization?").
 * Only leaving the page counts: a change of search params on the same page (a dialog opening, a
 * tab) never asks. Closing or reloading the tab gets the browser's own prompt.
 */
export function useUnsavedGuard(dirty: boolean): UnsavedGuard {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  })
  return {
    asking: blocker.status === 'blocked',
    discard: () => blocker.proceed?.(),
    keepEditing: () => blocker.reset?.(),
  }
}

/**
 * ⌘S (Ctrl+S) saves a dirty form or role. The browser's "Save page" is suppressed only while
 * there's something of ours to save; otherwise the key does what it always does.
 */
export function useSaveShortcut(enabled: boolean, save: () => void) {
  const latest = useRef(save)
  latest.current = save
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 's') {
        return
      }
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
