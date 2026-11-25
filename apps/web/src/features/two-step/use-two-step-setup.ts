import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage, isLocked } from '@/lib/auth-errors'

type Stage =
  | { name: 'password' }
  | { name: 'scan'; totpURI: string; backupCodes: string[] }
  | { name: 'codes'; backupCodes: string[] }

/**
 * Password → scan → verify → backup codes. Better Auth asks for the password before it
 * creates the secret, and turns two-step on only once a code from the app is verified.
 */
export function useTwoStepSetup() {
  const [stage, setStage] = useState<Stage>({ name: 'password' })
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirmPassword(password: string) {
    setPending(true)
    setError(null)
    const { data, error: failure } = await authClient.twoFactor.enable({ password })
    setPending(false)
    if (failure || !data || data.method !== 'totp') {
      setError(failure ? authErrorMessage(failure, 'sign-in') : authErrorMessage({ status: 500 }))
      return
    }
    setStage({ name: 'scan', totpURI: data.totpURI, backupCodes: data.backupCodes })
  }

  async function verify(code: string) {
    if (stage.name !== 'scan' || pending) return
    if (code.length < 6) return setError('Enter all 6 digits.')
    setPending(true)
    setError(null)
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code })
    setPending(false)
    if (failure) {
      setError(authErrorMessage(failure, 'two-step'))
      setLocked(isLocked(failure))
      return
    }
    setStage({ name: 'codes', backupCodes: stage.backupCodes })
  }

  return { stage, error, setError, locked, pending, confirmPassword, verify }
}

/** "otpauth://…?secret=JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP", for typing the key by hand. */
export function formatTotpSecret(uri: string): string {
  try {
    const secret = new URL(uri).searchParams.get('secret') ?? ''
    return secret.replace(/(.{4})/g, '$1 ').trim()
  } catch {
    return ''
  }
}
