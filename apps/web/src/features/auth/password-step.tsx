import { Link } from '@tanstack/react-router'
import { FingerprintIcon, LoaderCircleIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { EmailSuggestion, useEmailSuggestion } from '@/components/auth/email-suggestion'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { forgetRememberedEmail } from '@/lib/remembered-email'
import { AuthFailureText } from './auth-failure-text'
import { useAuthFailure } from './use-auth-failure'
import { formatCountdown } from './use-countdown'
import { useDesktopAutofocus } from './use-desktop-autofocus'
import { usePasskeySignIn } from './use-passkey-sign-in'
import { type SignInResult, signInWithPassword } from './use-sign-in'

type Values = { email: string; password: string; keepSignedIn: boolean }

type Props = {
  defaultEmail?: string | undefined
  /** The default email was remembered on this device: offer "Not you?". */
  remembered?: boolean
  onResult: (
    result: Exclude<SignInResult, { status: 'error' }>,
    email: string,
    keepSignedIn: boolean,
  ) => void
  /** Signed in with a passkey: no email typed, no two-step code (decision 0019). */
  onPasskeySignedIn: (keepSignedIn: boolean) => void
}

/** Board SignIn: work email, password, "Keep me signed in". No Google/Microsoft (CHANGES.md). */
export function PasswordStep({
  defaultEmail = '',
  remembered = false,
  onResult,
  onPasskeySignedIn,
}: Props) {
  const ids = { email: useId(), password: useId(), keep: useId(), error: useId() }
  const { failure, setFailure, secondsLeft, waiting } = useAuthFailure()
  const form = useForm<Values>({
    defaultValues: { email: defaultEmail, password: '', keepSignedIn: false },
    shouldFocusError: true,
  })
  const { errors, isSubmitting } = form.formState
  const [showNotYou, setShowNotYou] = useState(remembered)
  const typo = useEmailSuggestion((email) =>
    form.setValue('email', email, { shouldDirty: true, shouldValidate: !!errors.email }),
  )
  useDesktopAutofocus(() => form.setFocus(defaultEmail ? 'password' : 'email'))
  const passkey = usePasskeySignIn({
    autoFill: true,
    keepSignedIn: () => form.getValues('keepSignedIn'),
    onSignedIn: () => onPasskeySignedIn(form.getValues('keepSignedIn')),
  })

  function notYou() {
    forgetRememberedEmail()
    setShowNotYou(false)
    form.setValue('email', '')
    form.setFocus('email')
  }

  const submit = form.handleSubmit(async (values) => {
    if (waiting) return
    setFailure(null)
    passkey.clear()
    const result = await signInWithPassword(values)
    if (result.status === 'error') {
      setFailure(result.failure)
      form.setValue('password', '')
      form.setFocus('password')
      return
    }
    onResult(result, values.email.trim(), values.keepSignedIn)
  })

  return (
    <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeader title="Sign in" />
      {failure ? (
        <FormAlert variant="error">
          <AuthFailureText failure={failure} secondsLeft={secondsLeft} />
        </FormAlert>
      ) : (
        passkey.message && <FormAlert variant="error">{passkey.message}</FormAlert>
      )}
      <Field data-invalid={!!errors.email}>
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel htmlFor={ids.email}>Work email</FieldLabel>
          {showNotYou && (
            <button
              type="button"
              onClick={notYou}
              className="text-link text-xs hover:text-link-hover hover:underline max-lg:-my-3.5 max-lg:inline-flex max-lg:min-h-11 max-lg:items-center"
            >
              Not you?
            </button>
          )}
        </div>
        <Input
          id={ids.email}
          type="email"
          // "webauthn": the browser offers saved passkeys among the email suggestions.
          autoComplete="username webauthn"
          inputMode="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${ids.email}-error` : undefined}
          {...form.register('email', {
            onBlur: (event) => typo.check(event.target.value),
            onChange: typo.clear,
            required: 'Enter your work email',
          })}
        />
        <FieldError id={`${ids.email}-error`}>{errors.email?.message}</FieldError>
        <EmailSuggestion suggestion={typo.suggestion} onAccept={typo.accept} />
      </Field>
      <Field data-invalid={!!errors.password}>
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
          {/* Phones: a 44px touch target without making the label row taller. */}
          <Link
            to="/forgot-password"
            className="text-link text-xs hover:text-link-hover hover:underline max-lg:-my-3.5 max-lg:inline-flex max-lg:min-h-11 max-lg:items-center"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id={ids.password}
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? `${ids.password}-error` : undefined}
          {...form.register('password', { required: 'Enter your password' })}
        />
        <FieldError id={`${ids.password}-error`}>{errors.password?.message}</FieldError>
      </Field>
      <KeepSignedIn id={ids.keep} form={form} />
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || waiting}>
        {waiting
          ? `Try again in ${formatCountdown(secondsLeft)}`
          : isSubmitting
            ? 'Signing in…'
            : 'Sign in'}
      </Button>
      {passkey.available && (
        <div className="-mt-1.5 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={passkey.pending}
            aria-busy={passkey.pending || undefined}
            onClick={() => {
              setFailure(null)
              void passkey.start()
            }}
          >
            {passkey.pending ? (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            ) : (
              <FingerprintIcon aria-hidden />
            )}
            Sign in with a passkey
          </Button>
          <p
            aria-live="polite"
            className="min-h-0 text-center text-muted-foreground text-xs empty:hidden"
          >
            {passkey.note}
          </p>
        </div>
      )}
      <AuthFootnote>
        New to Vento? <Link to="/sign-up">Create an account</Link>
      </AuthFootnote>
    </form>
  )
}

function KeepSignedIn({ id, form }: { id: string; form: ReturnType<typeof useForm<Values>> }) {
  const checked = form.watch('keepSignedIn')
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px]">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => form.setValue('keepSignedIn', value === true)}
      />
      Keep me signed in for 30 days
    </label>
  )
}
