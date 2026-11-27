import { ORPCError } from '@orpc/client'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { ServerPasswordIssues } from '@/components/auth/password-rules'
import { meQuery } from '@/features/account/api'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { COPY, GENERIC_ERROR, NETWORK_ERROR, passwordIssues } from '@/lib/auth-errors'
import { connection } from '@/lib/connection'
import { errorReason, isNetworkFailure } from '@/lib/error-data'
import { joinClient } from './join-client'

export type JoinStep = 'account' | 'two_step' | 'codes' | 'passkey'

const CLOSED = new Set([
  'invitation_expired',
  'invitation_withdrawn',
  'invitation_not_pending',
  'staff_customer_account',
])

/** Step 1's request and what it says when refused; the typed fields always stay. */
export type JoinStart = ReturnType<typeof useStaffJoin>['join']

/**
 * The staff sign-up's steps (plan §1b.5): name and password (`console.join.start`, which signs
 * in), then two-step through Better Auth (the code makes them a super-admin), backup codes, an
 * optional passkey, and the console. The password stays in memory only for two-step's enable.
 */
export function useStaffJoin(token: string, email: string | null) {
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<JoinStep>('account')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [issues, setIssues] = useState<ServerPasswordIssues>({})

  async function start(typed: string, name?: string) {
    if (pending) return
    if (!connection.isOnline()) return setError(OFFLINE_SAVE_ERROR)
    setPending(true)
    setError(null)
    setFieldError(null)
    try {
      const { next } = await joinClient.console.join.start({ token, password: typed, name })
      if (next === 'sign_in') {
        return void navigate({ to: '/sign-in', search: email ? { email } : {}, replace: true })
      }
      // Signed in now: the rest of the app reads this person.
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
      setPassword(typed)
      setStep('two_step')
    } catch (failure) {
      refused(failure)
    } finally {
      setPending(false)
    }
  }

  function refused(failure: unknown) {
    if (isNetworkFailure(failure)) return setError(NETWORK_ERROR)
    const reason = errorReason(failure)
    if (reason && CLOSED.has(reason)) {
      // The invitation changed meanwhile: show what the link says now.
      return void router.invalidate()
    }
    if (failure instanceof ORPCError && failure.code === 'TOO_MANY_REQUESTS') {
      return setError(COPY.tooManyRequests)
    }
    if (failure instanceof ORPCError && failure.code === 'BAD_REQUEST') {
      if (reason === 'wrong_password') return setFieldError(failure.message)
      const found = passwordIssues({ status: 400, code: reason ?? undefined })
      if (found.rule || found.reused) return setIssues(found)
      return setError(failure.message)
    }
    setError(failure instanceof ORPCError && failure.status < 500 ? failure.message : GENERIC_ERROR)
  }

  return {
    step,
    setStep,
    password,
    join: {
      start: (typed: string, name?: string) => void start(typed, name),
      pending,
      error,
      fieldError,
      issues,
      clearIssues: () => setIssues({}),
    },
  }
}
