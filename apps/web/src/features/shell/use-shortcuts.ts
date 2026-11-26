import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toggleSidebar } from '@/lib/theme'
import { bufferPaletteKey, shellUi } from './shell-ui'
import { createShortcutMatcher } from './shortcuts'

/** The shell's one keydown listener (no dependency). Esc is left to Radix dialogs and menus. */
export function useShortcuts() {
  const navigate = useNavigate()
  useEffect(() => {
    const match = createShortcutMatcher()
    function onKeyDown(event: KeyboardEvent) {
      if (bufferWhilePaletteLoads(event)) return
      const id = match(event)
      if (!id) return
      // A single key pressed while a dialog or menu is open belongs to it.
      const overlayOpen =
        document.querySelector(
          '[role="dialog"][data-state="open"],[role="menu"][data-state="open"]',
        ) !== null
      if (id !== 'palette' && overlayOpen) return
      event.preventDefault()
      if (id === 'palette') shellUi.toggle('palette')
      if (id === 'help') shellUi.open('shortcuts')
      if (id === 'sidebar' && window.matchMedia('(min-width: 1024px)').matches) toggleSidebar()
      if (id === 'home') void navigate({ to: '/' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}

/** The palette is open but its input isn't on the page yet: keep what's typed for it. */
function bufferWhilePaletteLoads(event: KeyboardEvent): boolean {
  if (!document.documentElement.hasAttribute('data-palette-pending')) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key.length !== 1 && event.key !== 'Backspace') return false
  event.preventDefault()
  bufferPaletteKey(event.key)
  return true
}
