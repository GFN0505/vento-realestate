import { useQueryClient } from '@tanstack/react-query'
import { AUTH_ERROR_MESSAGES, AUTH_ERROR_CODES as C, type SecurityOverview } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { securityQuery } from '@/features/settings/security-queries'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { NETWORK_ERROR } from '@/lib/error-copy'
import { sessionExpired } from '@/lib/session-expired'
import { securityUi } from './security-dialogs'
import { useReauth } from './use-reauth'

type Failure = { code?: string | undefined; status: number; message?: string | undefined }

const codeOf = (error: object): string | undefined =>
  'code' in error && typeof error.code === 'string' ? error.code : undefined

export const ADD_FAILED = 'Passkey not added. Try again, or use another device.'
const ALREADY_HERE = 'This device already has a passkey for your account.'

/** Copy for a failed add; null when the person cancelled the device prompt (say nothing). */
export function addPasskeyError(
  error: Failure,
  isCancel: (code?: string) => boolean,
): string | null {
  if (isCancel(error.code)) return null
  if (!error.status) return NETWORK_ERROR
  switch (error.code) {
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return ALREADY_HERE
    case C.PASSKEY_LIMIT:
      return AUTH_ERROR_MESSAGES.PASSKEY_LIMIT
    case C.PASSKEYS_UNAVAILABLE:
      return "Passkeys aren't available here any more."
  }
  return ADD_FAILED
}

/**
 * Add a passkey (spec): "Confirm it's you" unless confirmed in the last 5 minutes, then the
 * device's own Face ID or fingerprint prompt. The WebAuthn library loads only now.
 */
export function useAddPasskey() {
  const queryClient = useQueryClient()
  const reauth = useReauth()
  const [pending, setPending] = useState(false)

  async function attempt() {
    const { passkeyAuth } = await import('@/lib/passkey-client')
    return passkeyAuth.passkey.addPasskey()
  }

  async function add() {
    if (pending) return
    if (!connection.isOnline()) return void toast.error(OFFLINE_SAVE_ERROR)
    if (!(await reauth.ensureConfirmed())) return
    setPending(true)
    try {
      const { isPasskeyCancel } = await import('@/lib/passkey-client')
      let result = await attempt()
      // The window closed between the check and the server (another tab, a slow phone).
      if (result.error && codeOf(result.error) === C.REAUTH_REQUIRED) {
        reauth.expire()
        if (!(await reauth.ensureConfirmed())) return
        result = await attempt()
      }
      const { data, error } = result
      if (error) {
        if (error.status === 401) return sessionExpired.open()
        const code = codeOf(error)
        const message = addPasskeyError({ status: error.status, code }, isPasskeyCancel)
        if (message) toast.error(message)
        if (code === C.PASSKEYS_UNAVAILABLE || code === C.PASSKEY_LIMIT) {
          void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
        }
        return
      }
      await queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
      const added = data && 'id' in data ? (data as { id: string; name?: string | null }) : null
      const name =
        added?.name ??
        queryClient.getQueryData<SecurityOverview>(securityQuery().queryKey)?.passkeys.items[0]
          ?.name
      toast.success(name ? `Passkey added · ${name}` : 'Passkey added', {
        action: added ? { label: 'Rename', onClick: () => securityUi.rename(added.id) } : undefined,
      })
    } catch {
      toast.error(ADD_FAILED)
    } finally {
      setPending(false)
    }
  }

  return { add, pending }
}
