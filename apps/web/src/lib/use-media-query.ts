import { useSyncExternalStore } from 'react'

/** Live `matchMedia`, right on the first render (no flash of the other layout). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', listener)
      return () => list.removeEventListener('change', listener)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Below 768px: cards instead of tables, full-height sheets (spec). */
export const PHONE_QUERY = '(max-width: 767px)'
