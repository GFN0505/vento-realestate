import { Link } from '@tanstack/react-router'
import type { AuthFailure } from '@/lib/auth-errors'
import { formatCountdown } from './use-countdown'

const resetLink = (
  <Link to="/forgot-password" className="font-semibold underline underline-offset-2">
    reset your password
  </Link>
)

/** The words for a sign-in failure, with the reset link and the live wait where they apply. */
export function AuthFailureText({
  failure,
  secondsLeft,
}: {
  failure: AuthFailure
  secondsLeft: number
}) {
  if (failure.kind === 'wrong-password') {
    return <>That email and password don't match. Check them or {resetLink}.</>
  }
  if (failure.kind === 'locked') {
    const wait = secondsLeft > 0 ? formatCountdown(secondsLeft) : '15 minutes'
    return (
      <>
        Too many wrong {failure.lockedBy}. Try again in <span className="tabular-nums">{wait}</span>
        , or {resetLink}.
      </>
    )
  }
  return <>{failure.message}</>
}
