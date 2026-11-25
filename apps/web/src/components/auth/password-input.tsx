import { ArrowBigUpDashIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { type ComponentProps, type KeyboardEvent, type PointerEvent, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<'input'>, 'type'> & {
  /** Controlled visibility, so a password and its confirmation show and hide together. */
  visible?: boolean
  onVisibleChange?: (visible: boolean) => void
  /** Names what the toggle shows: "password" (default) or "passwords" for a pair. */
  toggleNoun?: 'password' | 'passwords'
}

/**
 * A password field with a show/hide button, so people on phones can check what they typed,
 * and a "Caps Lock is on" note inside the field (so nothing below it moves).
 */
export function PasswordInput({
  className,
  visible: visibleProp,
  onVisibleChange,
  toggleNoun = 'password',
  onKeyDown,
  onKeyUp,
  onPointerDown,
  onBlur,
  ...props
}: Props) {
  const [ownVisible, setOwnVisible] = useState(false)
  const visible = visibleProp ?? ownVisible
  const setVisible = onVisibleChange ?? setOwnVisible
  const caps = useCapsLock()

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn(caps.on ? 'pr-40' : 'pr-12', className)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        onKeyDown={(event) => {
          caps.read(event)
          onKeyDown?.(event)
        }}
        onKeyUp={(event) => {
          caps.read(event)
          onKeyUp?.(event)
        }}
        onPointerDown={(event) => {
          caps.read(event)
          onPointerDown?.(event)
        }}
        onBlur={(event) => {
          caps.clear()
          onBlur?.(event)
        }}
        {...props}
      />
      {/* Always in the DOM so screen readers announce the change. */}
      <span
        aria-live="polite"
        className="pointer-events-none absolute inset-y-0 right-12 flex items-center md:right-10"
      >
        {caps.on && (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-amber-bg px-2 py-0.5 font-medium text-status-amber-fg text-xs">
            <ArrowBigUpDashIcon className="size-3.5" aria-hidden />
            Caps Lock is on
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={`${visible ? 'Hide' : 'Show'} ${toggleNoun}`}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground md:w-10"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

/** Caps Lock can only be read from key and pointer events, so it's checked on each one. */
function useCapsLock() {
  const [on, setOn] = useState(false)
  return {
    on,
    read: (event: KeyboardEvent | PointerEvent) => setOn(event.getModifierState('CapsLock')),
    clear: () => setOn(false),
  }
}
