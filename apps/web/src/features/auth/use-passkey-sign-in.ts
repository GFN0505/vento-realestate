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

// A challenge lives 5 minutes on the server: ask for a fresh one a little before.
const REFRESH_MS = 4.5 * 60_000
// After an error, wait a moment before listening again, so a dead network can't spin.
const REARM_DELAY_MS = 2_000

/** Ends a waiting passkey request, if the library was ever loaded. */
function cancelCeremony() {
  void import('@/lib/passkey-client').then((m) => m.cancelPasskeyCeremony())
}

/**
 * The passkey half of signing in: the button, and (where the browser supports it) passkeys in
 * the email field's suggestions, kept listening with a fresh challenge until someone signs in.
 * A failed passkey never counts towards a sign-in lock.
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
  // Each autofill listen has a number; only the latest may re-arm itself.
  const generation = useRef(0)
  const started = useRef(false)
  const stopped = useRef(false)

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

  async function listen() {
    if (!autoFill || !supported || stopped.current || !(await supportsPasskeyAutofill())) return
    const mine = ++generation.current
    started.current = true
    const result = await signInWithPasskey({
      autoFill: true,
      keepSignedIn: () => latest.current.keepSignedIn(),
    })
    // Replaced by the button, a refresh or a password submit: the newer listen carries on.
    if (mine !== generation.current || !alive.current) return
    settle(result, true)
    if (result.status === 'signed-in' || stopped.current) return
    if (result.status === 'error' && result.code === C.PASSKEYS_UNAVAILABLE) return
    window.setTimeout(
      () => mine === generation.current && void listen(),
      result.status === 'error' ? REARM_DELAY_MS : 0,
    )
  }

  function restartListening() {
    if (!started.current) return void listen()
    generation.current++
    cancelCeremony()
    void listen()
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: start listening once, on mount.
  useEffect(() => {
    alive.current = true
    stopped.current = false
    void listen()
    const refresh = autoFill ? window.setInterval(restartListening, REFRESH_MS) : undefined
    return () => {
      alive.current = false
      stopped.current = true
      window.clearInterval(refresh)
      if (started.current) cancelCeremony()
    }
  }, [])

  async function start() {
    if (pending) return
    setPending(true)
    setMessage(null)
    setNote(null)
    // The button's prompt replaces the suggestions (the library aborts them).
    generation.current++
    started.current = true
    const result = await signInWithPasskey({ keepSignedIn: () => latest.current.keepSignedIn() })
    if (!alive.current) return
    setPending(false)
    settle(result, false)
    if (result.status !== 'signed-in') void listen()
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
    /** Signing in with a password: stop offering passkeys until it fails. */
    pause() {
      generation.current++
      if (started.current) cancelCeremony()
    },
    resume: () => void listen(),
  }
}
