import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toggleSidebar } from '@/lib/theme'
import { shellUi } from './shell-ui'
import { createShortcutMatcher, PAGE_SHORTCUT_EVENT, SHORTCUTS } from './shortcuts'

/** The shell's one keydown listener (no dependency). Esc is left to Radix dialogs and menus. */
export function useShortcuts() {
  const navigate = useNavigate()
  useEffect(() => {
    const match = createShortcutMatcher()
    function onKeyDown(event: KeyboardEvent) {
      const id = match(event)
      if (!id) return
      // A single key pressed while a dialog or menu is open belongs to it.
      const overlayOpen =
        document.querySelector(
          '[role="dialog"][data-state="open"],[role="menu"][data-state="open"]',
        ) !== null
      if (id !== 'palette' && overlayOpen) return
      const page = SHORTCUTS.find((s) => s.id === id)?.page
      if (page) {
        if (window.location.pathname !== page.path) return
        event.preventDefault()
        window.dispatchEvent(new CustomEvent(PAGE_SHORTCUT_EVENT, { detail: id }))
        return
      }
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
