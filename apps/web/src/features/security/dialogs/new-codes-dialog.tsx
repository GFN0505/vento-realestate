import { useQueryClient } from '@tanstack/react-query'
import { AUTH_ERROR_CODES as C } from '@vento/shared'
import { LoaderCircleIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { BackupCodes } from '@/components/auth/backup-codes'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { useMe } from '@/features/preview/use-effective-permissions'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { connection } from '@/lib/connection'
import { hasFinePointer } from '@/lib/pointer'
import { sessionExpired } from '@/lib/session-expired'
import { securityQuery } from '../security-queries'
import { CLEARED_NOTE, useClearedOnExpiry } from '../use-cleared-on-expiry'
import { DialogFrame, dialogBodyClass, dialogFooterClass, dialogFormClass } from './dialog-frame'

type Props = { open: boolean; onClose: () => void; email: string | undefined }

/**
 * New backup codes (spec, 3 clicks): the password (Better Auth asks for it, plan question 3),
 * then 10 codes shown once. The old ones stop working the moment the new ones appear.
 */
export function NewCodesDialog({ open, onClose, email }: Props) {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  if (!open && codes) setCodes(null)
  return (
    <DialogFrame
      open={open}
      // Once shown, the codes must be saved before it closes (spec).
      busy={pending || codes !== null}
      onClose={onClose}
      title="New backup codes"
      description={
        codes
          ? 'Your old codes stop working now. Save these 10 somewhere safe. Each works once.'
          : 'Your old codes stop working once you make new ones.'
      }
    >
      {open &&
        (codes ? (
          <CodesStep codes={codes} email={email} onDone={onClose} />
        ) : (
          <PasswordStep onCodes={setCodes} onBusy={setPending} onCancel={onClose} />
        ))}
    </DialogFrame>
  )
}

function PasswordStep({
  onCodes,
  onBusy,
  onCancel,
}: {
  onCodes: (codes: string[]) => void
  onBusy: (busy: boolean) => void
  onCancel: () => void
}) {
  const id = useId()
  const me = useMe()
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
    if (!connection.isOnline()) return setFormError(OFFLINE_SAVE_ERROR)
    setFieldError(null)
    setFormError(null)
    setPending(true)
    onBusy(true)
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password })
    setPending(false)
    onBusy(false)
    if (data?.backupCodes) {
      // In force now, whatever happens next: the row reads "10 of 10 left".
      void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
      return onCodes(data.backupCodes)
    }
    if (!error) return setFormError(authErrorMessage({ status: 500 }))
    if (error.status === 401) return sessionExpired.open()
    if (error.code === C.INVALID_PASSWORD) {
      setPassword('')
      return setFieldError("That's not your password.")
    }
    if (error.code === C.TWO_FACTOR_NOT_ENABLED) {
      void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
      return setFormError('Two-step is off now. The page is up to date.')
    }
    setFormError(authErrorMessage(error, 'sign-in'))
  }

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)} className={dialogFormClass}>
      <DialogBody className={dialogBodyClass}>
        {cleared && !password && <FormAlert variant="info">{CLEARED_NOTE}</FormAlert>}
        {formError && <FormAlert variant="error">{formError}</FormAlert>}
        <Field data-invalid={!!fieldError}>
          <FieldLabel htmlFor={id}>Password</FieldLabel>
          <input type="email" autoComplete="username" value={me.user.email} readOnly hidden />
          <PasswordInput
            id={id}
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            autoFocus={hasFinePointer()}
            value={password}
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
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Make new codes
        </Button>
      </DialogFooter>
    </form>
  )
}

function CodesStep({
  codes,
  email,
  onDone,
}: {
  codes: string[]
  email: string | undefined
  onDone: () => void
}) {
  const me = useMe()
  const [saved, setSaved] = useState(false)
  return (
    <div className={dialogFormClass}>
      <DialogBody className={dialogBodyClass}>
        <BackupCodes
          codes={codes}
          email={email ?? me.user.email}
          saved={saved}
          onSavedChange={setSaved}
        />
      </DialogBody>
      <DialogFooter className={dialogFooterClass}>
        <Button
          disabled={!saved}
          onClick={() => {
            toast.success('New backup codes saved')
            onDone()
          }}
        >
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}
