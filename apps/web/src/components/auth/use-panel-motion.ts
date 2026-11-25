import { type RefObject, useEffect } from 'react'

/** Only a real mouse gets the spotlight, and never when the person asked for less motion. */
const SPOTLIGHT_QUERY =
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'

/**
 * Wires the brand panel's motion without React state: pauses its CSS animations while the tab
 * is hidden (`data-paused`), and moves the pointer spotlight by writing `--x` / `--y` at most
 * once per frame (`data-spotlight` turns it on while the mouse is over the panel).
 */
export function usePanelMotion(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = ref.current
    if (!panel) return

    const syncVisibility = () =>
      panel.toggleAttribute('data-paused', document.visibilityState === 'hidden')
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    const stopVisibility = () => document.removeEventListener('visibilitychange', syncVisibility)

    if (!window.matchMedia(SPOTLIGHT_QUERY).matches) return stopVisibility

    let frame = 0
    let clientX = 0
    let clientY = 0
    const write = () => {
      frame = 0
      const box = panel.getBoundingClientRect()
      panel.style.setProperty('--x', `${clientX - box.left}px`)
      panel.style.setProperty('--y', `${clientY - box.top}px`)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      clientX = event.clientX
      clientY = event.clientY
      panel.dataset.spotlight = 'on'
      if (!frame) frame = requestAnimationFrame(write)
    }
    const onLeave = () => delete panel.dataset.spotlight

    panel.addEventListener('pointermove', onMove, { passive: true })
    panel.addEventListener('pointerleave', onLeave)
    return () => {
      stopVisibility()
      cancelAnimationFrame(frame)
      panel.removeEventListener('pointermove', onMove)
      panel.removeEventListener('pointerleave', onLeave)
    }
  }, [ref])
}
