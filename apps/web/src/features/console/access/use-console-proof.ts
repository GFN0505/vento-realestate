import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ConfirmInput, ConsoleStatus } from '@vento/shared/console'
import { useState } from 'react'
import { toast } from 'sonner'
import { resetForNewSession } from '@/features/account/api'
import { useMe } from '@/features/preview/use-effective-permissions'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { consoleClient, consoleOrpc } from '../api'
import { consoleGate } from '../gate/console-gate'
import { type ConfirmFailure, confirmFailure } from './confirm-errors'
import { PASSKEY_CANCELLED, passkeyAssertion } from './passkey-proof'

export type ProofState = {
  pending: 'passkey' | 'code' | null
  failure: ConfirmFailure | null
}

/**
 * Sends a passkey, code or backup code to `access.confirm`. On success the window is open and
 * every parked request runs again; a lock sends the person to sign-in, as on My security.
 */
export function useConsoleProof() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const me = useMe()
  const [state, setState] = useState<ProofState>({ pending: null, failure: null })

  function opened(status: ConsoleStatus) {
    queryClient.setQueryData(consoleOrpc.console.access.status.queryKey(), status)
    if (status.window === 'open') consoleGate.opened()
    else if (status.window === 'two_step_required') consoleGate.twoStepMissing()
  }

  function refused(error: unknown, method: ConfirmInput['method']) {
    const failure = confirmFailure(error, method)
    setState({ pending: null, failure })
    if (!failure.locked) return failure
    toast.error(failure.message, { duration: 10_000 })
    consoleGate.reset()
    resetForNewSession(queryClient)
    void navigate({ to: '/sign-in', search: { email: me.user.email }, replace: true })
    return failure
  }

  async function confirm(input: ConfirmInput): Promise<ConfirmFailure | null> {
    if (!connection.isOnline()) {
      const failure = { message: OFFLINE_SAVE_ERROR, onField: false, locked: false }
      setState({ pending: null, failure })
      return failure
    }
    setState({ pending: input.method === 'passkey' ? 'passkey' : 'code', failure: null })
    try {
      const status = await consoleClient.console.access.confirm(input)
      setState({ pending: null, failure: null })
      opened(status)
      return null
    } catch (error) {
      return refused(error, input.method)
    }
  }

  async function provePasskey(): Promise<void> {
    setState({ pending: 'passkey', failure: null })
    try {
      const response = await passkeyAssertion()
      if (response === PASSKEY_CANCELLED) return setState({ pending: null, failure: null })
      await confirm({ method: 'passkey', response })
    } catch (error) {
      refused(error, 'passkey')
    }
  }

  return {
    ...state,
    confirm,
    provePasskey,
    clearFailure: () => setState((s) => ({ ...s, failure: null })),
  }
}
