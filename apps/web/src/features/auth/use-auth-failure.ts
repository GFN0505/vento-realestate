import { useEffect, useState } from 'react'
import type { AuthFailure } from '@/lib/auth-errors'
import { useCountdown } from './use-countdown'

/**
 * Holds the latest sign-in failure and counts down any wait it carries. When a lockout or
 * rate limit runs out, the message clears and the form works again.
 */
export function useAuthFailure() {
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const secondsLeft = useCountdown(failure?.until ?? 0)
  const waiting = failure?.until != null && secondsLeft > 0

  useEffect(() => {
    if (failure?.until != null && secondsLeft === 0 && failure.until <= Date.now()) {
      setFailure(null)
    }
  }, [failure, secondsLeft])

  return { failure, setFailure, secondsLeft, waiting }
}
