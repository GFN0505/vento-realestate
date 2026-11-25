import { useMutation } from '@tanstack/react-query'
import { CURRENT_TERMS_VERSION, type InvitationPreview } from '@vento/shared'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useDesktopAutofocus } from '@/features/auth/use-desktop-autofocus'
import { apiErrorMessage, errorReason } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'

type Props = {
  token: string
  preview: InvitationPreview
  onAccepted: () => void
  onHasAccount: () => void
  /** Joined, but signing in straight away failed; they sign in themselves. */
  onSignInNeeded: () => void
}

/** New to Vento: name and a password, then straight in (two-step setup if the role needs it). */
export function AcceptAsNewUser({
  token,
  preview,
  onAccepted,
  onHasAccount,
  onSignInNeeded,
}: Props) {
  const ids = { name: useId(), email: useId() }
  const form = useForm({ defaultValues: { name: '', password: '', confirm: '' } })
  const { errors } = form.formState
  useDesktopAutofocus(() => form.setFocus('name'))
  const accept = useMutation(orpc.invitations.acceptAsNewUser.mutationOptions())

  const submit = form.handleSubmit((values) =>
    accept.mutate(
      {
        token,
        name: values.name.trim(),
        password: values.password,
        termsVersion: CURRENT_TERMS_VERSION,
      },
      {
        onSuccess: (result) => (result.nextStep === 'sign_in' ? onSignInNeeded() : onAccepted()),
        onError: (error) => {
          if (errorReason(error) === 'account_exists') onHasAccount()
        },
      },
    ),
  )

  return (
    <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      {accept.error && errorReason(accept.error) !== 'account_exists' && (
        <FormAlert variant="error">{apiErrorMessage(accept.error)}</FormAlert>
      )}
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor={ids.name}>Your name</FieldLabel>
        <Input
          id={ids.name}
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          {...form.register('name', {
            validate: (v) => v.trim().length >= 2 || 'Enter your full name',
          })}
        />
        <FieldError id={`${ids.name}-error`}>{errors.name?.message}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.email}>Email</FieldLabel>
        <Input id={ids.email} type="email" autoComplete="username" value={preview.email} readOnly />
      </Field>
      <NewPasswordFields form={form} label="Create a password" />
      <Button type="submit" size="lg" className="w-full" disabled={accept.isPending}>
        {accept.isPending
          ? 'Joining…'
          : preview.twoStepRequired
            ? 'Accept and set up two-step'
            : 'Accept invitation'}
      </Button>
    </form>
  )
}
