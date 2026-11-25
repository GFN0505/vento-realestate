import { Link, useNavigate } from '@tanstack/react-router'
import { CURRENT_TERMS_VERSION } from '@vento/shared'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { EmailSuggestion, useEmailSuggestion } from '@/components/auth/email-suggestion'
import { FormAlert } from '@/components/auth/form-alert'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage, passwordIssues } from '@/lib/auth-errors'
import { TermsCheckbox } from './terms-checkbox'
import { useDesktopAutofocus } from './use-desktop-autofocus'

type Values = {
  name: string
  companyName: string
  email: string
  password: string
  confirm: string
  terms: boolean
}

/** Board SignUp. The "30-day trial" line is hidden: no billing yet (CHANGES.md). */
export function SignUpForm() {
  const navigate = useNavigate()
  const ids = { name: useId(), company: useId(), email: useId(), terms: useId() }
  const [serverError, setServerError] = useState<AuthClientError | null>(null)
  const form = useForm<Values>({
    defaultValues: {
      name: '',
      companyName: '',
      email: '',
      password: '',
      confirm: '',
      terms: false,
    },
  })
  const { errors, isSubmitting } = form.formState
  const issues = passwordIssues(serverError)
  const typo = useEmailSuggestion((email) =>
    form.setValue('email', email, { shouldDirty: true, shouldValidate: !!errors.email }),
  )
  useDesktopAutofocus(() => form.setFocus('name'))

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
      if (passwordIssues(error).rule) form.setFocus('password')
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
    <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeader title="Create your company account" />
      {serverError && !issues.rule && (
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
          autoComplete="username"
          inputMode="email"
          {...fieldProps('email', ids.email)}
          {...form.register('email', {
            onBlur: (event) => typo.check(event.target.value),
            onChange: typo.clear,
            required: 'Enter your work email',
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: 'Enter an email like olumide@ventohomes.ng',
            },
          })}
        />
        <FieldError id={`${ids.email}-error`}>{errors.email?.message}</FieldError>
        <EmailSuggestion suggestion={typo.suggestion} onAccept={typo.accept} />
      </Field>
      <NewPasswordFields
        form={form}
        label="Password"
        serverIssues={issues}
        onPasswordChange={() => issues.rule && setServerError(null)}
      />
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
