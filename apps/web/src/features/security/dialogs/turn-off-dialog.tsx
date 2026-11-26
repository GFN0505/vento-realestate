import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AUTH_ERROR_CODES as C, type TwoStepRequirement, twoStepRefusal } from '@vento/shared'
import { LoaderCircleIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { CodeInput } from '@/components/auth/code-input'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { resetForNewSession } from '@/features/account/api'
import { useMe } from '@/features/preview/use-effective-permissions'
import { securityQuery } from '@/features/settings/security-queries'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage, COPY, isLocked } from '@/lib/auth-errors'
import { connection } from '@/lib/connection'
import { orpc } from '@/lib/orpc'
import { hasFinePointer } from '@/lib/pointer'
import { sessionExpired } from '@/lib/session-expired'
import { CLEARED_NOTE, useClearedOnExpiry } from '../use-cleared-on-expiry'
import { DialogFrame, dialogBodyClass, dialogFooterClass, dialogFormClass } from './dialog-frame'

type Props = { open: boolean; onClose: () => void }
type Refusal = AuthClientError & { requiredBy?: TwoStepRequirement }

/** "Turn off two-step?" (spec): always the password and a current code, or a backup code. */
export function TurnOffDialog({ open, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  return (
    <DialogFrame
      open={open}
      busy={busy}
      onClose={onClose}
      title="Turn off two-step?"
      description="You'll sign in with just your password. We'll email you to confirm."
    >
      {open && <TurnOffForm onClose={onClose} onBusy={setBusy} />}
    </DialogFrame>
  )
}

function TurnOffForm({ onClose, onBusy }: { onClose: () => void; onBusy: (b: boolean) => void }) {
  const ids = { password: useId(), code: useId() }
  const me = useMe()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; code?: string; form?: string }>({})
  const [pending, setPending] = useState(false)
  const cleared = useClearedOnExpiry(() => setPassword(''))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const missing = {
      ...(!password && { password: 'Enter your password' }),
      ...(backup
        ? !code.trim() && { code: 'Enter a backup code' }
        : code.length < 6 && { code: 'Enter all 6 digits.' }),
    }
    if (Object.keys(missing).length > 0) return setErrors(missing)
    if (!connection.isOnline()) return setErrors({ form: OFFLINE_SAVE_ERROR })
    setErrors({})
    setPending(true)
    onBusy(true)
    const { error } = await authClient.$fetch<{ status: boolean }>('/two-factor/disable', {
      method: 'POST',
      body: backup ? { password, backupCode: code.trim() } : { password, code },
    })
    setPending(false)
    onBusy(false)
    if (!error) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.account.me.key() }),
        queryClient.invalidateQueries({ queryKey: securityQuery().queryKey }),
      ])
      toast.success('Two-step is off')
      return onClose()
    }
    refused(error as Refusal)
  }

  function refused(error: Refusal) {
    if (error.status === 401) return sessionExpired.open()
    if (isLocked(error)) {
      // Five wrong codes in a row lock sign-in and end every session (2a): back to sign-in.
      toast.error(authErrorMessage(error, 'two-step'), { duration: 10_000 })
      resetForNewSession(queryClient)
      return void navigate({ to: '/sign-in', search: { email: me.user.email }, replace: true })
    }
    switch (error.code) {
      case C.INVALID_PASSWORD:
        setPassword('')
        return setErrors({ password: "That's not your password." })
      case C.INVALID_CODE:
        setCode('')
        return setErrors({ code: COPY.wrongCode })
      case C.INVALID_BACKUP_CODE:
        return setErrors({ code: COPY.wrongBackupCode })
      case C.CODE_REQUIRED:
        return setErrors({ code: 'Enter the code from your authenticator app, or a backup code.' })
      case C.TWO_STEP_REQUIRED_BY_ROLE:
      case C.TWO_STEP_REQUIRED_BY_ORGANIZATION:
        // Something started requiring it since the page loaded: say what, and show it.
        void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
        return setErrors({
          form: error.requiredBy ? twoStepRefusal(error.requiredBy) : (error.message ?? ''),
        })
      case C.TWO_FACTOR_NOT_ENABLED:
        void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
        toast('Two-step is off now. The page is up to date.')
        return onClose()
    }
    setErrors({ form: authErrorMessage(error) })
  }

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)} className={dialogFormClass}>
      <DialogBody className={`${dialogBodyClass} gap-4`}>
        {cleared && !password && <FormAlert variant="info">{CLEARED_NOTE}</FormAlert>}
        {errors.form && <FormAlert variant="error">{errors.form}</FormAlert>}
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
          <input type="email" autoComplete="username" value={me.user.email} readOnly hidden />
          <PasswordInput
            id={ids.password}
            name="password"
            autoComplete="current-password"
            autoFocus={hasFinePointer()}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (errors.password) setErrors({ ...errors, password: undefined })
            }}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? `${ids.password}-error` : undefined}
          />
          <FieldError id={`${ids.password}-error`} role="alert">
            {errors.password}
          </FieldError>
        </Field>
        <Field data-invalid={!!errors.code}>
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel htmlFor={ids.code}>
              {backup ? 'Backup code' : 'Code from your authenticator app'}
            </FieldLabel>
            <button
              type="button"
              onClick={() => {
                setBackup(!backup)
                setCode('')
                setErrors({ ...errors, code: undefined })
              }}
              className="rounded-sm text-link text-xs outline-hidden hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-ring max-md:-my-3.5 max-md:inline-flex max-md:min-h-11 max-md:items-center"
            >
              {backup ? 'Use your authenticator app' : 'Use a backup code'}
            </button>
          </div>
          {backup ? (
            <Input
              id={ids.code}
              name="backup-code"
              value={code}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="tabular-nums tracking-wider"
              onChange={(event) => {
                setCode(event.target.value)
                if (errors.code) setErrors({ ...errors, code: undefined })
              }}
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? `${ids.code}-error` : undefined}
            />
          ) : (
            <CodeInput
              id={ids.code}
              size="compact"
              value={code}
              onChange={(value) => {
                setCode(value)
                if (errors.code) setErrors({ ...errors, code: undefined })
              }}
              invalid={!!errors.code}
              aria-describedby={errors.code ? `${ids.code}-error` : undefined}
            />
          )}
          <FieldError id={`${ids.code}-error`} role="alert">
            {errors.code}
          </FieldError>
        </Field>
      </DialogBody>
      <DialogFooter className={dialogFooterClass}>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Keep it on
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Turn off two-step
        </Button>
      </DialogFooter>
    </form>
  )
}
