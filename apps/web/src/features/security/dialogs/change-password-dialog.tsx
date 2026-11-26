import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircleIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormAlert } from '@/components/auth/form-alert'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { useMe } from '@/features/preview/use-effective-permissions'
import { securityQuery, sessionsQuery } from '@/features/settings/security-queries'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage, isLocked, passwordIssues } from '@/lib/auth-errors'
import { connection } from '@/lib/connection'
import { hasFinePointer } from '@/lib/pointer'
import { sessionExpired } from '@/lib/session-expired'
import { devicesWords } from '../security-words'
import { CLEARED_NOTE, useClearedOnExpiry } from '../use-cleared-on-expiry'
import { DialogFrame, dialogBodyClass, dialogFooterClass, dialogFormClass } from './dialog-frame'
import { safeAuth } from './safe-auth'

type Values = { current: string; password: string; confirm: string }
const EMPTY: Values = { current: '', password: '', confirm: '' }

type Props = { open: boolean; onClose: () => void; otherDevices: number }

/** Change password (spec): current, new with the 2a rules, confirm. Other devices sign out. */
export function ChangePasswordDialog({ open, onClose, otherDevices }: Props) {
  const [busy, setBusy] = useState(false)
  return (
    <DialogFrame
      open={open}
      busy={busy}
      onClose={onClose}
      title="Change password"
      description="You'll stay signed in here. Other devices will be signed out."
    >
      {open && (
        <ChangePasswordForm onClose={onClose} onBusy={setBusy} otherDevices={otherDevices} />
      )}
    </DialogFrame>
  )
}

function ChangePasswordForm({
  onClose,
  onBusy,
  otherDevices,
}: {
  onClose: () => void
  onBusy: (busy: boolean) => void
  otherDevices: number
}) {
  const id = useId()
  const me = useMe()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<AuthClientError | null>(null)
  const [currentError, setCurrentError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const form = useForm<Values>({ defaultValues: EMPTY })
  const { isSubmitting, errors } = form.formState
  const issues = passwordIssues(serverError)
  const ruleFailed = !!(issues.reused || issues.rule)
  const cleared = useClearedOnExpiry(() => form.reset(EMPTY))

  const submit = form.handleSubmit(async ({ current, password }) => {
    setServerError(null)
    setCurrentError(null)
    setOffline(false)
    if (!connection.isOnline()) return setOffline(true)
    onBusy(true)
    const { error } = await safeAuth(() =>
      authClient.changePassword({
        currentPassword: current,
        newPassword: password,
        // The server ends every other session whatever is sent (2a); asking keeps the toast true.
        revokeOtherSessions: true,
      }),
    )
    onBusy(false)
    if (error) {
      if (error.status === 401) return sessionExpired.open()
      if (error.code === 'INVALID_PASSWORD') {
        form.setValue('current', '')
        setCurrentError("That's not your current password.")
        form.setFocus('current')
        return
      }
      setServerError(error)
      if (passwordIssues(error).rule || passwordIssues(error).reused) form.setFocus('password')
      return
    }
    toast.success(
      otherDevices > 0
        ? `Password changed. Signed out of ${devicesWords(otherDevices)}.`
        : 'Password changed',
    )
    void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
    void queryClient.invalidateQueries({ queryKey: sessionsQuery().queryKey })
    onClose()
  })

  return (
    <form method="post" noValidate onSubmit={(e) => void submit(e)} className={dialogFormClass}>
      <DialogBody className={dialogBodyClass}>
        {cleared && !form.watch('current') && <FormAlert variant="info">{CLEARED_NOTE}</FormAlert>}
        {offline && <FormAlert variant="error">{OFFLINE_SAVE_ERROR}</FormAlert>}
        {serverError && !ruleFailed && (
          <FormAlert variant="error">
            {isLocked(serverError)
              ? authErrorMessage(serverError, 'sign-in')
              : authErrorMessage(serverError)}
          </FormAlert>
        )}
        <Field data-invalid={!!(currentError || errors.current)}>
          <FieldLabel htmlFor={id}>Current password</FieldLabel>
          <input type="email" autoComplete="username" value={me.user.email} readOnly hidden />
          <PasswordInput
            id={id}
            autoComplete="current-password"
            autoFocus={hasFinePointer()}
            aria-invalid={!!(currentError || errors.current)}
            aria-describedby={currentError || errors.current ? `${id}-error` : undefined}
            {...form.register('current', {
              required: 'Enter your current password',
              onChange: () => currentError && setCurrentError(null),
            })}
          />
          <FieldError id={`${id}-error`} role="alert">
            {currentError ?? errors.current?.message}
          </FieldError>
        </Field>
        <NewPasswordFields
          form={form}
          label="New password"
          showReuseRule
          alwaysShowRules
          serverIssues={issues}
          onPasswordChange={() => ruleFailed && setServerError(null)}
        />
      </DialogBody>
      <DialogFooter className={dialogFooterClass}>
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
          {isSubmitting && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Change password
        </Button>
      </DialogFooter>
    </form>
  )
}
