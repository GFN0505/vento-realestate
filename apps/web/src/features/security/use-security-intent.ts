import type { SecurityOverview } from '@vento/shared'
import { useEffect, useRef } from 'react'
import type { SecurityIntent } from '@/features/settings/security-search'
import { securityUi } from './security-dialogs'
import { confirmedRecently } from './use-reauth'

type Options = {
  intent: SecurityIntent | undefined
  onIntentHandled: () => void
  data: SecurityOverview | undefined
  passkeys: { add: () => Promise<void> }
}

/**
 * Runs what ⌘K asked for (`?do=…`) once the page has its data, then clears it so Back and
 * Reload never repeat it. Returns the ref for "Add a passkey".
 */
export function useSecurityIntent({ intent, onIntentHandled, data, passkeys }: Options) {
  const addRef = useRef<HTMLButtonElement>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (!intent || !data || handled.current) return
    handled.current = true
    onIntentHandled()
    if (intent === 'change-password') securityUi.open({ name: 'change-password' })
    if (intent === 'turn-on' && !data.twoStep.enabled) securityUi.open({ name: 'turn-on' })
    if (intent === 'add-passkey' && data.passkeys.available) {
      // Safari only shows Face ID for a tap. Asking for the password gives one (Continue);
      // without that question, the button waits, focused, for the person's own tap.
      if (confirmedRecently(data)) {
        addRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        addRef.current?.focus({ preventScroll: true })
      } else {
        void passkeys.add()
      }
    }
  }, [intent, data, onIntentHandled, passkeys])

  return addRef
}
