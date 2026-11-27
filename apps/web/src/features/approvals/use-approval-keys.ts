import { useEffect, useRef } from 'react'
import { PAGE_SHORTCUT_EVENT } from '@/features/shell/shortcuts'

/**
 * J and K move through the list (spec); A and R belong to the open request's buttons. Wraps
 * nothing: at either end the key does nothing, so a held key never jumps back to the top.
 */
export function useApprovalKeys(
  ids: readonly string[],
  current: string | undefined,
  open: (id: string) => void,
) {
  const latest = useRef({ ids, current, open })
  latest.current = { ids, current, open }
  useEffect(() => {
    function onShortcut(event: Event) {
      const shortcut = (event as CustomEvent<string>).detail
      if (shortcut !== 'approvals-next' && shortcut !== 'approvals-previous') return
      const { ids, current, open } = latest.current
      const index = current ? ids.indexOf(current) : -1
      const next = ids[shortcut === 'approvals-next' ? index + 1 : index - 1]
      if (next) open(next)
    }
    window.addEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
    return () => window.removeEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
  }, [])
}

/** The request to open once this one leaves the list: the one below, else the one above. */
export function neighbourOf(ids: readonly string[], id: string): string | undefined {
  const index = ids.indexOf(id)
  if (index < 0) return ids[0]
  return ids[index + 1] ?? ids[index - 1]
}
