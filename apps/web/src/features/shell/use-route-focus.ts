import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * After moving to another page (not a search-only change, not the first load), focus the page
 * title so screen readers announce it and keyboard users start from the top of the content.
 */
export function useRouteFocus() {
  const router = useRouter()
  useEffect(() => {
    return router.subscribe('onResolved', (event) => {
      if (!event.fromLocation || !event.pathChanged) return
      requestAnimationFrame(() => {
        const title = document.querySelector<HTMLElement>('#main h1')
        title?.focus({ preventScroll: true })
      })
    })
  }, [router])
}
