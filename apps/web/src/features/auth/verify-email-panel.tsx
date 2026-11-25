import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { MailIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { CodeInput } from '@/components/auth/code-input'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { resetForNewSession } from '@/features/account/api'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage, retryAfterSeconds } from '@/lib/auth-errors'
import { formatCountdown, useCountdown } from './use-countdown'

const RESEND_GAP_MS = 60_000

/** Board VerifyEmail: open the link, or type the 6-digit code from the same email. */
export function VerifyEmailPanel({ email }: { email: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const errorId = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // The email was sent just before this screen opened, so the first resend waits a minute.
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_GAP_MS)
  const secondsLeft = useCountdown(resendAt)

  async function verify(value: string) {
    if (pending) return
    if (value.length < 6) return setError('Enter all 6 digits.')
    setPending(true)
    setError(null)
    const { error: failure } = await authClient.emailOtp.verifyEmail({ email, otp: value })
    setPending(false)
    if (failure) {
      setError(authErrorMessage(failure, 'email-code'))
      setCode('')
      return
    }
    // Verifying signs the person in; the app sends them on to onboarding.
    resetForNewSession(queryClient)
    void navigate({ to: '/', replace: true })
  }

  async function resend() {
    setResendAt(Date.now() + RESEND_GAP_MS)
    const { error: failure } = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/verify-email',
    })
    if (failure) {
      const wait = retryAfterSeconds(failure)
      if (wait) setResendAt(Date.now() + wait * 1000)
      toast.error(authErrorMessage(failure))
      return
    }
    toast.success(`New email sent to ${email}`)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void verify(code)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
      <div className="flex size-14 items-center justify-center rounded-[14px] bg-selected">
        <MailIcon className="size-7 text-primary" strokeWidth={1.7} aria-hidden />
      </div>
      <AuthHeader title="Check your email">
        We sent a link to{' '}
        <b className="font-semibold text-foreground [overflow-wrap:anywhere]">{email}</b>. It
        expires in 30 minutes.
      </AuthHeader>
      <span className="font-semibold text-muted-foreground text-xs" id={`${errorId}-label`}>
        Or enter the code from the email
      </span>
      <CodeInput
        value={code}
        onChange={(value) => {
          setCode(value)
          if (error) setError(null)
        }}
        onComplete={(value) => void verify(value)}
        invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} role="alert">
        {error}
      </FieldError>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Verifying…' : 'Verify email'}
      </Button>
      <AuthFootnote>
        Didn't get it? Check spam, or{' '}
        {secondsLeft > 0 ? (
          <span aria-live="polite">resend in {formatCountdown(secondsLeft)}</span>
        ) : (
          <button type="button" onClick={() => void resend()}>
            resend it
          </button>
        )}{' '}
        · <Link to="/sign-up">Change email</Link>
      </AuthFootnote>
    </form>
  )
}
