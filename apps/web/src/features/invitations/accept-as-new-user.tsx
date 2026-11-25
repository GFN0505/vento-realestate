import { useMutation } from '@tanstack/react-query'
import { CURRENT_TERMS_VERSION, checkPasswordLocally, type InvitationPreview } from '@vento/shared'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordRules } from '@/components/auth/password-rules'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiErrorMessage, errorReason } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'

type Props = {
  token: string
  preview: InvitationPreview
  onAccepted: () => void
  onHasAccount: () => void
}

/** New to Vento: name and a password, then straight in (two-step setup if the role needs it). */
export function AcceptAsNewUser({ token, preview, onAccepted, onHasAccount }: Props) {
  const ids = { name: useId(), email: useId(), password: useId() }
  const form = useForm({ defaultValues: { name: '', password: '' } })
  const { errors } = form.formState
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
        onSuccess: onAccepted,
        onError: (error) => {
          if (errorReason(error) === 'account_exists') onHasAccount()
        },
      },
    ),
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
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
      <Field data-invalid={!!errors.password}>
        <FieldLabel htmlFor={ids.password}>Create a password</FieldLabel>
        <PasswordInput
          id={ids.password}
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={`${ids.password}-rules`}
          {...form.register('password', {
            validate: (v) => {
              const c = checkPasswordLocally(v)
              return (c.length && c.number) || 'Use at least 12 characters, including a number'
            },
          })}
        />
        <PasswordRules id={`${ids.password}-rules`} password={form.watch('password')} />
        <FieldError>{errors.password?.message}</FieldError>
      </Field>
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
