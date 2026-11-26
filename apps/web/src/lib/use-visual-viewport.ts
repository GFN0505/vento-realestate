import { useEffect, useState } from 'react'

/**
 * The visible height while a phone keyboard is open. Full-height sheets size themselves to it so
 * their sticky footer (Send, Save) stays above the keyboard on browsers that overlay it.
 * null on larger screens or without the API.
 */
export function useVisualViewportHeight(active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!active || !viewport || !window.matchMedia('(max-width: 767px)').matches) {
      setHeight(null)
      return
    }
    const update = () => setHeight(Math.round(viewport.height))
    update()
    viewport.addEventListener('resize', update)
    return () => viewport.removeEventListener('resize', update)
  }, [active])
  return height
}
