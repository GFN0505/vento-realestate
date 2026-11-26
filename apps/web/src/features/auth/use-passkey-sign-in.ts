import { AUTH_ERROR_CODES as C } from '@vento/shared'
import { useEffect, useRef, useState } from 'react'
import { browserSupportsPasskeys, supportsPasskeyAutofill } from '@/lib/passkey-support'
import { PASSKEY_CANCELLED, type PasskeySignInResult, signInWithPasskey } from './passkey-sign-in'

type Options = {
  /** Offer passkeys in the email field's suggestions (sign-in page only). */
  autoFill: boolean
  keepSignedIn: () => boolean
  onSignedIn: () => void
}

/**
 * The passkey half of signing in: the button, and (where the browser supports it) passkeys in
 * the email field's suggestions. A failed passkey never counts towards a sign-in lock.
 */
export function usePasskeySignIn({ autoFill, keepSignedIn, onSignedIn }: Options) {
  const [supported] = useState(browserSupportsPasskeys)
  const [unavailable, setUnavailable] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const latest = useRef({ keepSignedIn, onSignedIn })
  latest.current = { keepSignedIn, onSignedIn }
  const alive = useRef(true)

  function settle(result: PasskeySignInResult, fromAutofill: boolean) {
    if (!alive.current) return
    if (result.status === 'signed-in') return latest.current.onSignedIn()
    if (result.status === 'cancelled') {
      // A ceremony replaced by another, or the person closing the prompt: only the button says so.
      if (!fromAutofill) setNote(PASSKEY_CANCELLED)
      return
    }
    // The kill switch: passkeys are off for everyone, so the button goes away.
    if (result.code === C.PASSKEYS_UNAVAILABLE && fromAutofill) return setUnavailable(true)
    setMessage(result.message)
  }

  async function listenForAutofill() {
    if (!autoFill || !supported || !(await supportsPasskeyAutofill())) return
    const result = await signInWithPasskey({
      autoFill: true,
      keepSignedIn: () => latest.current.keepSignedIn(),
    })
    settle(result, true)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: start listening once, on mount.
  useEffect(() => {
    alive.current = true
    void listenForAutofill()
    return () => {
      alive.current = false
    }
  }, [])

  async function start() {
    if (pending) return
    setPending(true)
    setMessage(null)
    setNote(null)
    const result = await signInWithPasskey({ keepSignedIn: () => latest.current.keepSignedIn() })
    if (!alive.current) return
    setPending(false)
    settle(result, false)
    // The button's prompt replaced the suggestions; offer them again.
    if (result.status !== 'signed-in') void listenForAutofill()
  }

  return {
    available: supported && !unavailable,
    pending,
    message,
    note,
    start,
    clear: () => {
      setMessage(null)
      setNote(null)
    },
  }
}
