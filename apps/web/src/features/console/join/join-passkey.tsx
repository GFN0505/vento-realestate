import { FingerprintIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AuthHeader } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { PendingLabel } from '@/components/ui/pending-label'
import { addPasskeyError } from '@/features/security/passkey-actions'
import { browserSupportsPasskeys } from '@/lib/passkey-support'

/**
 * Step 4 (spec §1): "Add a passkey?", or skip. A device that can't make passkeys skips it by
 * itself. The WebAuthn library loads only on **Add passkey**.
 */
export function JoinPasskey({ onDone }: { onDone: () => void }) {
  const supported = browserSupportsPasskeys()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported) onDone()
  }, [supported, onDone])

  async function add() {
    setPending(true)
    setError(null)
    try {
      const { passkeyAuth, isPasskeyCancel } = await import('@/lib/passkey-client')
      const result = await passkeyAuth.passkey.addPasskey()
      if (!result.error) return onDone()
      const code =
        'code' in result.error && typeof result.error.code === 'string'
          ? result.error.code
          : undefined
      setError(addPasskeyError({ status: result.error.status, code }, isPasskeyCancel))
    } catch {
      setError('Passkey not added. Try again, or skip for now.')
    } finally {
      setPending(false)
    }
  }

  if (!supported) return null
  return (
    <>
      <AuthHeader title="Add a passkey?">
        Sign in with your fingerprint, face or screen lock.
      </AuthHeader>
      {error && <FormAlert variant="error">{error}</FormAlert>}
      <Button
        size="lg"
        className="relative w-full"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => void add()}
      >
        <PendingLabel pending={pending}>
          <FingerprintIcon aria-hidden />
          Add passkey
        </PendingLabel>
      </Button>
      <Button size="lg" variant="ghost" className="w-full" disabled={pending} onClick={onDone}>
        Skip for now
      </Button>
    </>
  )
}
