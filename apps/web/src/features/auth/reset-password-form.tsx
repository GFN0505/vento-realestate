import { useNavigate } from '@tanstack/react-router'
import { checkPasswordLocally } from '@vento/shared'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordRules } from '@/components/auth/password-rules'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage, passwordIssues } from '@/lib/auth-errors'

type Values = { password: string; confirm: string }

/** Board ResetPassword, without the "sign out other devices" tickbox: they always end. */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate()
  const ids = { password: useId(), confirm: useId() }
  const [serverError, setServerError] = useState<AuthClientError | null>(null)
  const form = useForm<Values>({ defaultValues: { password: '', confirm: '' } })
  const { errors, isSubmitting } = form.formState
  const issues = passwordIssues(serverError)
  const ruleFailed = !!(issues.common || issues.reused)

  const submit = form.handleSubmit(async ({ password }) => {
    setServerError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    if (error) {
      setServerError(error)
      form.setFocus('password')
      return
    }
    toast.success('Password changed. Sign in with your new password.')
    void navigate({ to: '/sign-in', search: { email }, replace: true })
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      {serverError && !ruleFailed && (
        <FormAlert variant="error">{authErrorMessage(serverError)}</FormAlert>
      )}
      <Field data-invalid={!!errors.password || ruleFailed}>
        <FieldLabel htmlFor={ids.password}>New password</FieldLabel>
        <PasswordInput
          id={ids.password}
          autoComplete="new-password"
          aria-invalid={!!errors.password || ruleFailed}
          aria-describedby={`${ids.password}-rules`}
          {...form.register('password', {
            onChange: () => ruleFailed && setServerError(null),
            validate: (v) => {
              const c = checkPasswordLocally(v)
              return (c.length && c.number) || 'Use at least 12 characters, including a number'
            },
          })}
        />
        {/* Hidden username lets password managers save the new password against the account. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
      </Field>
      <PasswordRules
        id={`${ids.password}-rules`}
        password={form.watch('password')}
        serverIssues={issues}
        showReuseRule
      />
      <FieldError>
        {errors.password?.message ??
          (ruleFailed && serverError ? authErrorMessage(serverError) : null)}
      </FieldError>
      <Field data-invalid={!!errors.confirm}>
        <FieldLabel htmlFor={ids.confirm}>Confirm new password</FieldLabel>
        <PasswordInput
          id={ids.confirm}
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? `${ids.confirm}-error` : undefined}
          {...form.register('confirm', {
            validate: (v, all) => v === all.password || "The passwords don't match",
          })}
        />
        <FieldError id={`${ids.confirm}-error`}>{errors.confirm?.message}</FieldError>
      </Field>
      <p className="text-muted-foreground text-xs">
        You'll be signed out on all other devices, and asked for two-step at your next sign-in.
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save and sign in'}
      </Button>
    </form>
  )
}
