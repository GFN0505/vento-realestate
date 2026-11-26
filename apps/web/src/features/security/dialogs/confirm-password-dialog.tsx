import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { SecurityOverview } from '@vento/shared'
import { LoaderCircleIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { securityQuery } from '@/features/settings/security-queries'
import { apiErrorMessage, errorReason, isHandledElsewhere } from '@/lib/api-errors'
import { client } from '@/lib/orpc'
import { hasFinePointer } from '@/lib/pointer'
import { securityUi, useSecurityUi } from '../security-dialogs'
import { CLEARED_NOTE, useClearedOnExpiry } from '../use-cleared-on-expiry'
import { DialogFrame, dialogBodyClass, dialogFooterClass, dialogFormClass } from './dialog-frame'

/** "Confirm it's you" (spec): the password, then the action that asked for it carries on. */
export function ConfirmPasswordDialog() {
  const open = useSecurityUi((s) => s.confirm !== null)
  const [busy, setBusy] = useState(false)
  return (
    <DialogFrame
      open={open}
      busy={busy}
      onClose={() => securityUi.settleConfirm(false)}
      title="Confirm it's you"
      description="Enter your password to continue."
    >
      {open && <ConfirmForm onBusy={setBusy} />}
    </DialogFrame>
  )
}

function ConfirmForm({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const id = useId()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const cleared = useClearedOnExpiry(() => setPassword(''))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!password) return setFieldError('Enter your password')
    setPending(true)
    onBusy(true)
    setFieldError(null)
    setFormError(null)
    try {
      const { reauthenticatedUntil } = await client.account.confirmPassword({ password })
      queryClient.setQueryData<SecurityOverview>(securityQuery().queryKey, (data) =>
        data ? { ...data, reauthenticatedUntil } : data,
      )
      securityUi.settleConfirm(true)
    } catch (error) {
      if (isHandledElsewhere(error)) return
      if (errorReason(error) === 'wrong_password') {
        setPassword('')
        setFieldError("That's not your password.")
      } else {
        // Locked, too many tries, offline: the server's words, and the password stays typed.
        setFormError(apiErrorMessage(error))
      }
    } finally {
      setPending(false)
      onBusy(false)
    }
  }

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)} className={dialogFormClass}>
      <DialogBody className={dialogBodyClass}>
        {cleared && !password && <FormAlert variant="info">{CLEARED_NOTE}</FormAlert>}
        {formError && <FormAlert variant="error">{formError}</FormAlert>}
        <Field data-invalid={!!fieldError}>
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel htmlFor={id}>Password</FieldLabel>
            <Link
              to="/forgot-password"
              className="text-link text-xs hover:text-link-hover hover:underline max-md:-my-3.5 max-md:inline-flex max-md:min-h-11 max-md:items-center"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id={id}
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            autoFocus={hasFinePointer()}
            onChange={(event) => {
              setPassword(event.target.value)
              if (fieldError) setFieldError(null)
            }}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? `${id}-error` : undefined}
          />
          <FieldError id={`${id}-error`} role="alert">
            {fieldError}
          </FieldError>
        </Field>
      </DialogBody>
      <DialogFooter className={dialogFooterClass}>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => securityUi.settleConfirm(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Continue
        </Button>
      </DialogFooter>
    </form>
  )
}
