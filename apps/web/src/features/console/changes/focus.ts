import { useEffect, useState } from 'react'
import { hasFinePointer } from '@/lib/pointer'

const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea'
const FIELDS = `[role=radio], ${TEXT}, select, [role=checkbox], [role=switch]`

/**
 * A sheet or dialog opens on its first field (the chosen option, else the first one), never on
 * Cancel. On phones a text box isn't focused, so the keyboard doesn't jump up; the panel itself
 * takes focus instead, so screen readers start at its title.
 */
export function focusFirstField(event: Event) {
  const panel = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!panel) return
  event.preventDefault()
  panel.focus({ preventScroll: true })
  // A frame later: radio groups register their options after the panel's own mount.
  requestAnimationFrame(() => {
    if (document.activeElement !== panel) return
    // The chosen option first (as the arrow keys expect), else the first field in order.
    const checked = panel.querySelector<HTMLElement>('[role=radio][data-state=checked]')
    const target =
      checked ??
      [...panel.querySelectorAll<HTMLElement>(FIELDS)].find(
        (el) => !el.hasAttribute('disabled') && (hasFinePointer() || !el.matches(TEXT)),
      )
    target?.focus()
  })
}

/**
 * Change sheets and dialogs mount when the address opens them and unmount when it closes them,
 * which skips Radix's own return of focus. This puts focus back on what opened them (the button,
 * or the ⋯ menu's trigger) when it would otherwise be lost on the page body.
 */
let remembered: HTMLElement | null = null

/** What has focus now, or for a ⋯ menu item (about to vanish) the menu's own button. */
function currentOpener(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null
  const menu = active?.closest('[role=menu]')
  if (menu?.id) return document.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`)
  return active === document.body ? null : active
}

/** Called as a change is opened (before the address changes), while the opener still has focus. */
export function rememberOpener() {
  remembered = currentOpener()
}

export function useReturnFocus() {
  const [opener] = useState(() => {
    if (typeof document === 'undefined') return null
    const found = remembered ?? currentOpener()
    remembered = null
    return found
  })
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        const lost = !document.activeElement || document.activeElement === document.body
        if (lost && opener?.isConnected) opener.focus({ preventScroll: true })
      })
    },
    [opener],
  )
}

/**
 * The mid-task "Confirm it's you" closes back into the change it interrupted: the reason box of
 * the open sheet or dialog, else its first control. Its own trigger was disabled while pending.
 */
export function focusIntoOpenChange(event: Event) {
  // The closing proof dialog reads data-state="closed" by now; the change under it is still open.
  const change = [...document.querySelectorAll<HTMLElement>('[role=dialog][data-state=open]')].at(
    -1,
  )
  if (!change) return
  const reason = change.querySelector<HTMLElement>('textarea[name=reason]:not([disabled])')
  const first = change.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled])',
  )
  const target = reason ?? first
  if (!target) return
  event.preventDefault()
  target.focus({ preventScroll: true })
}
