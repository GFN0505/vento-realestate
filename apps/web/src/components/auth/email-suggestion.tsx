import { useEffect, useRef, useState } from 'react'
import { suggestEmail } from '@/lib/email-typo'

/**
 * "Did you mean ada@gmail.com?" after leaving an email field with a likely typo. Never blocks
 * anything. If the field was left by pressing on something else (a button, a checkbox), the
 * hint waits until the press is over, so it can't move the thing being clicked.
 */
export function useEmailSuggestion(apply: (email: string) => void) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const pressing = useRef(false)

  useEffect(() => {
    const down = () => {
      pressing.current = true
    }
    const up = () => {
      pressing.current = false
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
    }
  }, [])

  function check(value: string) {
    const next = suggestEmail(value)
    if (!next || !pressing.current) return setSuggestion(next)
    // After the click that follows pointerup has run.
    const show = () => setTimeout(() => setSuggestion(next), 0)
    document.addEventListener('pointerup', show, { once: true, capture: true })
  }

  return {
    suggestion,
    check,
    clear: () => setSuggestion(null),
    accept: () => {
      if (suggestion) apply(suggestion)
      setSuggestion(null)
    },
  }
}

export function EmailSuggestion({
  suggestion,
  onAccept,
}: {
  suggestion: string | null
  onAccept: () => void
}) {
  return (
    <>
      {/* Takes no space in the field, so an empty one doesn't add a gap. */}
      <span className="sr-only" aria-live="polite">
        {suggestion ? `Did you mean ${suggestion}?` : ''}
      </span>
      {suggestion && (
        <p className="text-muted-foreground text-xs">
          Did you mean{' '}
          <button
            type="button"
            onClick={onAccept}
            className="font-medium text-link underline-offset-4 [overflow-wrap:anywhere] hover:text-link-hover hover:underline max-lg:inline-flex max-lg:min-h-11 max-lg:items-center"
          >
            {suggestion}
          </button>
          ?
        </p>
      )}
    </>
  )
}
