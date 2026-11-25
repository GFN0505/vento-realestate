import { type CSSProperties, useSyncExternalStore } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// No theme provider yet (the toggle arrives in brick 3): read the class set in index.html.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
const isDark = () => document.documentElement.classList.contains('dark')

function Toaster(props: ToasterProps) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)
  return (
    <Sonner
      theme={dark ? 'dark' : 'light'}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
