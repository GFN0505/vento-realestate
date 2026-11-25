import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { Me } from '@vento/shared'
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
import { TwoStepCheck } from '@/features/auth/two-step-check'
import { signInWithPassword } from '@/features/auth/use-sign-in'
import { orpc } from '@/lib/orpc'
import { sessionExpired, useSessionExpired } from '@/lib/session-expired'

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
  const [pending, setPending] = useState(false)

  function done() {
    sessionExpired.close()
    // Refetch what failed; the page and its form state stay as they were.
    void queryClient.invalidateQueries()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!password) return setError('Enter your password.')
    setPending(true)
    setError(null)
    const result = await signInWithPassword({ email, password, keepSignedIn: false })
    setPending(false)
    setPassword('')
    if (result.status === 'error') return setError(result.message)
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
            {stage === 'password'
              ? 'For security, Vento signs you out after 30 minutes without activity.'
              : `Enter the 6-digit code from your authenticator app for ${email}.`}
          </DialogDescription>
        </DialogHeader>
        {stage === 'password' ? (
          <form onSubmit={submit} noValidate>
            <DialogBody>
              {error && <FormAlert variant="error">{error}</FormAlert>}
              <Field>
                <FieldLabel htmlFor={id}>Password for {email}</FieldLabel>
                <input type="email" autoComplete="username" value={email} readOnly hidden />
                <PasswordInput
                  id={id}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                />
              </Field>
              <FormAlert variant="info" title="Your work is safe.">
                Anything you typed on this page is still here.
              </FormAlert>
            </DialogBody>
            <DialogFooter className="max-md:[&>button]:h-11">
              <Button type="button" variant="outline" onClick={someoneElse}>
                Sign in as someone else
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in again'}
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
