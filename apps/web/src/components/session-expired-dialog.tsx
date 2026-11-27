import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { Me } from '@vento/shared'
import { FingerprintIcon, LoaderCircleIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { AuthFailureText } from '@/features/auth/auth-failure-text'
import { TwoStepCheck } from '@/features/auth/two-step-check'
import { useAuthFailure } from '@/features/auth/use-auth-failure'
import { formatCountdown } from '@/features/auth/use-countdown'
import { usePasskeySignIn } from '@/features/auth/use-passkey-sign-in'
import { signInWithPassword } from '@/features/auth/use-sign-in'
import { whoSignedIn } from '@/features/auth/who-signed-in'
import { NETWORK_ERROR } from '@/lib/error-copy'
import { orpc } from '@/lib/orpc'
import { sessionExpired, useSessionExpired } from '@/lib/session-expired'
import { forgetTabOrganization } from '@/lib/tab-organization'

/**
 * Board SessionExpired: a dialog over the page (full screen on phones), so whatever the person
 * typed underneath stays. Signing in again also asks for the two-step code (CHANGES.md).
 */
export function SessionExpiredDialog() {
  const open = useSessionExpired()
  const queryClient = useQueryClient()
  const me = queryClient.getQueryData<Me>(orpc.account.me.queryKey())
  if (!open || !me) return null
  return <ExpiredDialog email={me.user.email} />
}

function ExpiredDialog({ email }: { email: string }) {
  const id = useId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const href = useRouterState({ select: (s) => s.location.href })
  const [stage, setStage] = useState<'password' | 'code'>('password')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { failure, setFailure, secondsLeft, waiting } = useAuthFailure()
  const [pending, setPending] = useState(false)

  function done() {
    sessionExpired.close()
    // Refetch what failed; the page and its form state stay as they were.
    void queryClient.invalidateQueries()
  }

  const passkey = usePasskeySignIn({
    autoFill: false,
    keepSignedIn: () => false,
    onSignedIn: () => void afterPasskey(),
  })

  // A passkey can belong to someone else on a shared computer: then nothing on this page (its
  // data, what was typed, the tab's stores) is theirs, so the whole app loads afresh.
  async function afterPasskey() {
    const before = queryClient.getQueryData<Me>(orpc.account.me.queryKey())?.user.id
    const who = await whoSignedIn(before, () =>
      queryClient.fetchQuery({ ...orpc.account.me.queryOptions(), staleTime: 0 }),
    )
    if (who === 'same') return done()
    if (who === 'unknown') return setError(NETWORK_ERROR)
    forgetTabOrganization()
    window.location.replace('/')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (waiting) return
    if (!password) return setError('Enter your password.')
    setPending(true)
    setError(null)
    setFailure(null)
    const result = await signInWithPassword({ email, password, keepSignedIn: false })
    setPending(false)
    setPassword('')
    if (result.status === 'error') return setFailure(result.failure)
    if (result.status === 'two-step') return setStage('code')
    if (result.status === 'signed-in') return done()
  }

  function someoneElse() {
    sessionExpired.close()
    queryClient.removeQueries()
    void navigate({ to: '/sign-in', search: { redirect: href } })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && someoneElse()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="max-md:top-0 max-md:left-0 max-md:h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:content-start max-md:rounded-none"
      >
        <DialogHeader>
          <DialogTitle>Your session has ended</DialogTitle>
          <DialogDescription>
            {stage === 'password' ? (
              'For security, Vento Real Estate signs you out after 30 minutes without activity.'
            ) : (
              <>
                Enter the 6-digit code from your authenticator app for{' '}
                <span className="[overflow-wrap:anywhere]">{email}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {stage === 'password' ? (
          <form method="post" onSubmit={submit} noValidate>
            <DialogBody>
              {(failure || error || passkey.message) && (
                <FormAlert variant="error">
                  {failure ? (
                    <AuthFailureText failure={failure} secondsLeft={secondsLeft} />
                  ) : (
                    (error ?? passkey.message)
                  )}
                </FormAlert>
              )}
              <Field>
                <FieldLabel htmlFor={id} className="[overflow-wrap:anywhere]">
                  Password for {email}
                </FieldLabel>
                <input type="email" autoComplete="username" value={email} readOnly hidden />
                <PasswordInput
                  id={id}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                />
              </Field>
              {passkey.available && (
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full max-md:h-11"
                    disabled={passkey.pending}
                    aria-busy={passkey.pending || undefined}
                    onClick={() => {
                      setError(null)
                      setFailure(null)
                      void passkey.start()
                    }}
                  >
                    {passkey.pending ? (
                      <LoaderCircleIcon aria-hidden className="animate-spin" />
                    ) : (
                      <FingerprintIcon aria-hidden />
                    )}
                    Sign in with a passkey
                  </Button>
                  <p
                    aria-live="polite"
                    className="text-center text-muted-foreground text-xs empty:hidden"
                  >
                    {passkey.note}
                  </p>
                </div>
              )}
              <FormAlert variant="info" title="Your work is safe.">
                Anything you typed on this page is still here.
              </FormAlert>
            </DialogBody>
            <DialogFooter className="max-md:[&>button]:h-11">
              <Button type="button" variant="outline" onClick={someoneElse}>
                Sign in as someone else
              </Button>
              <Button type="submit" disabled={pending || waiting}>
                {waiting
                  ? `Try again in ${formatCountdown(secondsLeft)}`
                  : pending
                    ? 'Signing in…'
                    : 'Sign in again'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogBody>
            <TwoStepCheck
              compact
              email={email}
              onSignedIn={done}
              onRestart={(message) => {
                setStage('password')
                setError(message)
              }}
            />
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  )
}
