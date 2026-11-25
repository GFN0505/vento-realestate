import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type SignInResult, signInWithPassword } from './use-sign-in'

type Values = { email: string; password: string; keepSignedIn: boolean }

type Props = {
  defaultEmail?: string | undefined
  onResult: (result: Exclude<SignInResult, { status: 'error' }>, email: string) => void
}

/** Board SignIn: work email, password, "Keep me signed in". No Google/Microsoft (CHANGES.md). */
export function PasswordStep({ defaultEmail = '', onResult }: Props) {
  const ids = { email: useId(), password: useId(), keep: useId(), error: useId() }
  const [error, setError] = useState<string | null>(null)
  const form = useForm<Values>({
    defaultValues: { email: defaultEmail, password: '', keepSignedIn: false },
    shouldFocusError: true,
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await signInWithPassword(values)
    if (result.status === 'error') {
      setError(result.message)
      form.setValue('password', '')
      form.setFocus('password')
      return
    }
    onResult(result, values.email.trim())
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeader title="Sign in">Use your work email.</AuthHeader>
      {error && <FormAlert variant="error">{error}</FormAlert>}
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor={ids.email}>Work email</FieldLabel>
        <Input
          id={ids.email}
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${ids.email}-error` : undefined}
          {...form.register('email', { required: 'Enter your work email' })}
        />
        <FieldError id={`${ids.email}-error`}>{errors.email?.message}</FieldError>
      </Field>
      <Field data-invalid={!!errors.password}>
        <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
        <PasswordInput
          id={ids.password}
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? `${ids.password}-error` : undefined}
          {...form.register('password', { required: 'Enter your password' })}
        />
        <FieldError id={`${ids.password}-error`}>{errors.password?.message}</FieldError>
        <span className="text-xs">
          <Link to="/forgot-password" className="text-link hover:text-link-hover hover:underline">
            Forgot password?
          </Link>
        </span>
      </Field>
      <KeepSignedIn id={ids.keep} form={form} />
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
      <AuthFootnote>
        New to Vento? <Link to="/sign-up">Create a company account</Link>. Invited by a colleague?
        Use the link in your email.
      </AuthFootnote>
    </form>
  )
}

function KeepSignedIn({ id, form }: { id: string; form: ReturnType<typeof useForm<Values>> }) {
  const checked = form.watch('keepSignedIn')
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 border-t py-2.5 text-[13px]"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => form.setValue('keepSignedIn', value === true)}
        className="mt-px"
      />
      <span className="font-semibold">
        Keep me signed in on this device
        <span className="block font-normal text-muted-foreground text-xs">
          30 days. Don't tick this on a shared computer.
        </span>
      </span>
    </label>
  )
}
