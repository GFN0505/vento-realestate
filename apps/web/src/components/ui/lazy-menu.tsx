import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

/** What a lazily loaded menu receives: open at once, and take focus, if asked before it arrived. */
export type LazyMenuProps = { defaultOpen?: boolean; autoFocus?: boolean }

type Props = {
  load: () => Promise<ComponentType<LazyMenuProps>>
  /** The trigger's look, as a plain button; the loaded menu renders the same trigger. */
  children: ReactNode
  className?: string
  label?: string
}

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp'])

/**
 * A menu whose Radix code (menu, popper, scroll lock) loads when someone heads for it: on
 * hover, focus or press. Until then the trigger is a plain button that looks the same, keeping
 * those libraries out of the first load (plan 6.7). A press before the code arrives isn't lost:
 * the menu opens as soon as it does, and keyboard focus moves onto the real trigger.
 */
export function LazyMenu({ load, children, className, label }: Props) {
  const [Menu, setMenu] = useState<ComponentType<LazyMenuProps> | null>(null)
  const intent = useRef({ open: false, focus: false })
  const started = useRef(false)

  function start() {
    if (started.current) return
    started.current = true
    void load().then((component) => setMenu(() => component))
  }

  function press() {
    intent.current.open = true
    start()
  }

  if (Menu) return <Menu defaultOpen={intent.current.open} autoFocus={intent.current.focus} />

  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={false}
      aria-label={label}
      className={className}
      onPointerEnter={start}
      onFocus={() => {
        // Remember focus, so the real trigger takes it when it replaces this one.
        intent.current.focus = true
        start()
      }}
      onBlur={() => {
        intent.current.focus = false
      }}
      onPointerDown={(event) => {
        if (event.button === 0) press()
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (!OPEN_KEYS.has(event.key)) return
        event.preventDefault()
        press()
      }}
    >
      {children}
    </button>
  )
}

/** Focus the real trigger after it replaces the plain one, if the plain one had focus. */
export function useAutoFocus<T extends HTMLElement>(autoFocus: boolean | undefined) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return ref
}
