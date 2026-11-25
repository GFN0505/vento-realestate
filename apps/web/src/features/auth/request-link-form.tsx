import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { EmailSuggestion, useEmailSuggestion } from '@/components/auth/email-suggestion'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AuthClientError } from '@/lib/auth-errors'
import { authErrorMessage } from '@/lib/auth-errors'
import { useDesktopAutofocus } from './use-desktop-autofocus'

type Props = {
  defaultEmail?: string | undefined
  submitLabel: string
  pendingLabel: string
  send: (email: string) => Promise<{ error: AuthClientError | null }>
  onSent: (email: string) => void
}

/** One email field and a button: "Send reset link", "Send a new link". */
export function RequestLinkForm({
  defaultEmail = '',
  submitLabel,
  pendingLabel,
  send,
  onSent,
}: Props) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({ defaultValues: { email: defaultEmail } })
  const { errors, isSubmitting } = form.formState
  const typo = useEmailSuggestion((email) =>
    form.setValue('email', email, { shouldDirty: true, shouldValidate: !!errors.email }),
  )
  useDesktopAutofocus(() => form.setFocus('email'))

  const submit = form.handleSubmit(async ({ email }) => {
    setError(null)
    const result = await send(email.trim())
    if (result.error) return setError(authErrorMessage(result.error))
    onSent(email.trim())
  })

  return (
    <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      {error && <FormAlert variant="error">{error}</FormAlert>}
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor={id}>Work email</FieldLabel>
        <Input
          id={id}
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${id}-error` : undefined}
          {...form.register('email', {
            onBlur: (event) => typo.check(event.target.value),
            onChange: typo.clear,
            required: 'Enter your work email',
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: 'Enter an email like grace@ventohomes.ng',
            },
          })}
        />
        <FieldError id={`${id}-error`}>{errors.email?.message}</FieldError>
        <EmailSuggestion suggestion={typo.suggestion} onAccept={typo.accept} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
