import { type FormEvent, useId, useState } from 'react'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { CodeInput } from '@/components/auth/code-input'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthFailureText } from './auth-failure-text'
import { useAuthFailure } from './use-auth-failure'
import { formatCountdown } from './use-countdown'
import { verifySignInCode } from './use-sign-in'

type Props = {
  email: string
  onSignedIn: () => void
  /** The two-step window closed (10 minutes): go back to the password. */
  onRestart: (message: string) => void
  /** Back to the password step; shown as a text button where there's no header arrow. */
  onBack?: () => void
  /** Smaller heading inside the session-expired dialog. */
  compact?: boolean
}

/** Board SignIn2FA: the code from the authenticator app, or a backup code. */
export function TwoStepCheck({ email, onSignedIn, onRestart, onBack, compact = false }: Props) {
  const [kind, setKind] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  // Typing mistakes ("Enter all 6 digits") are local; server failures can carry a wait.
  const [hint, setHint] = useState<string | null>(null)
  const { failure, setFailure, secondsLeft, waiting } = useAuthFailure()
  const [pending, setPending] = useState(false)
  const ids = { error: useId(), backup: useId() }

  async function verify(value: string) {
    if (pending || waiting) return
    if (kind === 'totp' && value.length < 6) return setHint('Enter all 6 digits.')
    if (kind === 'backup' && !value.trim()) return setHint('Enter one of your backup codes.')
    setPending(true)
    setHint(null)
    setFailure(null)
    const result = await verifySignInCode(kind, value)
    setPending(false)
    if (result.status === 'signed-in') return onSignedIn()
    if (result.status === 'restart') return onRestart(result.message)
    setFailure(result.failure)
    setCode('')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void verify(code)
  }

  function switchKind() {
    setKind(kind === 'totp' ? 'backup' : 'totp')
    setCode('')
    setHint(null)
    if (!waiting) setFailure(null)
  }

  const invalid = !!(hint || failure)
  function clearOnEdit() {
    setHint(null)
    if (!waiting) setFailure(null)
  }
  const title = kind === 'totp' ? 'Two-step check' : 'Use a backup code'
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
      {!compact && (
        <AuthHeader title={title}>
          {kind === 'totp' ? (
            <>
              Enter the 6-digit code from your authenticator app for{' '}
              <span className="[overflow-wrap:anywhere]">{email}</span>.
            </>
          ) : (
            'Enter one of the 10 backup codes you saved when you set up two-step. Each works once.'
          )}
        </AuthHeader>
      )}
      {kind === 'totp' ? (
        <CodeInput
          value={code}
          onChange={(value) => {
            setCode(value)
            clearOnEdit()
          }}
          onComplete={(value) => void verify(value)}
          invalid={invalid}
          disabled={waiting}
          autoFocus
          aria-describedby={invalid ? ids.error : undefined}
        />
      ) : (
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={ids.backup}>Backup code</FieldLabel>
          <Input
            id={ids.backup}
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              clearOnEdit()
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            disabled={waiting}
            className="tabular-nums tracking-wider"
            aria-invalid={invalid}
            aria-describedby={invalid ? ids.error : undefined}
          />
        </Field>
      )}
      <FieldError id={ids.error} role="alert">
        {failure ? <AuthFailureText failure={failure} secondsLeft={secondsLeft} /> : hint}
      </FieldError>
      <Button type="submit" size="lg" className="w-full" disabled={pending || waiting}>
        {waiting
          ? `Try again in ${formatCountdown(secondsLeft)}`
          : pending
            ? 'Checking…'
            : 'Verify'}
      </Button>
      <AuthFootnote>
        <button type="button" onClick={switchKind}>
          {kind === 'totp' ? 'Use a backup code' : 'Use your authenticator app instead'}
        </button>
        {onBack && !compact && (
          <>
            {' · '}
            <button type="button" onClick={onBack}>
              Back to sign in
            </button>
          </>
        )}
        <br />
        Lost your phone and your codes? Ask an owner or admin to reset two-step.
      </AuthFootnote>
    </form>
  )
}
