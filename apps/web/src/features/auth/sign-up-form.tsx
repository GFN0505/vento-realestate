import { Link, useNavigate } from '@tanstack/react-router'
import { AUTH_ERROR_CODES, CURRENT_TERMS_VERSION, checkPasswordLocally } from '@vento/shared'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordRules } from '@/components/auth/password-rules'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage } from '@/lib/auth-errors'
import { TermsCheckbox } from './terms-checkbox'

type Values = { name: string; companyName: string; email: string; password: string; terms: boolean }

const PASSWORD_HINT = 'Use at least 12 characters, including a number'

/** Board SignUp. The "30-day trial" line is hidden: no billing yet (CHANGES.md). */
export function SignUpForm() {
  const navigate = useNavigate()
  const ids = { name: useId(), company: useId(), email: useId(), password: useId(), terms: useId() }
  const [serverError, setServerError] = useState<AuthClientError | null>(null)
  const form = useForm<Values>({
    defaultValues: { name: '', companyName: '', email: '', password: '', terms: false },
  })
  const { errors, isSubmitting } = form.formState
  const password = form.watch('password')

  const submit = form.handleSubmit(async (values) => {
    setServerError(null)
    const email = values.email.trim()
    const { error } = await authClient.signUp.email({
      name: values.name.trim(),
      companyName: values.companyName.trim(),
      email,
      password: values.password,
      termsVersion: CURRENT_TERMS_VERSION,
      callbackURL: '/verify-email',
    })
    if (error) {
      setServerError(error)
      return
    }
    // Same reply whether or not the email already has an account (owner's decision 9).
    void navigate({ to: '/verify-email', search: { email } })
  })

  const fieldProps = (name: keyof Values, id: string) => ({
    id,
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `${id}-error` : undefined,
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeader title="Create your company account" />
      {serverError && serverError.code !== AUTH_ERROR_CODES.PASSWORD_TOO_SHORT && (
        <FormAlert variant="error">{authErrorMessage(serverError)}</FormAlert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor={ids.name}>Your name</FieldLabel>
          <Input
            autoComplete="name"
            {...fieldProps('name', ids.name)}
            {...form.register('name', {
              validate: (v) => v.trim().length >= 2 || 'Enter your full name',
            })}
          />
          <FieldError id={`${ids.name}-error`}>{errors.name?.message}</FieldError>
        </Field>
        <Field data-invalid={!!errors.companyName}>
          <FieldLabel htmlFor={ids.company}>Company</FieldLabel>
          <Input
            autoComplete="organization"
            {...fieldProps('companyName', ids.company)}
            {...form.register('companyName', {
              validate: (v) => v.trim().length >= 2 || "Enter your company's name",
            })}
          />
          <FieldError id={`${ids.company}-error`}>{errors.companyName?.message}</FieldError>
        </Field>
      </div>
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor={ids.email}>Work email</FieldLabel>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          {...fieldProps('email', ids.email)}
          {...form.register('email', {
            required: 'Enter your work email',
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: 'Enter an email like olumide@ventohomes.ng',
            },
          })}
        />
        <FieldError id={`${ids.email}-error`}>{errors.email?.message}</FieldError>
      </Field>
      <Field data-invalid={!!errors.password}>
        <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
        <PasswordInput
          autoComplete="new-password"
          id={ids.password}
          aria-invalid={!!errors.password}
          aria-describedby={`${ids.password}-rules`}
          {...form.register('password', {
            validate: (v) => {
              const checks = checkPasswordLocally(v)
              return (checks.length && checks.number) || PASSWORD_HINT
            },
          })}
        />
        <PasswordRules
          id={`${ids.password}-rules`}
          password={password}
          showUnmetAsFailed={!!errors.password}
        />
      </Field>
      <TermsCheckbox
        id={ids.terms}
        checked={form.watch('terms')}
        onCheckedChange={(checked) => form.setValue('terms', checked, { shouldValidate: true })}
        error={errors.terms?.message}
      />
      <input
        type="hidden"
        {...form.register('terms', {
          validate: (v) => v || 'Agree to the terms and privacy notice to continue',
        })}
      />
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
      <AuthFootnote>
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </AuthFootnote>
    </form>
  )
}
