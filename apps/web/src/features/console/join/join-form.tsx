import type { StaffJoinPreview } from '@vento/shared/console'
import { type FormEvent, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AuthHeader } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PendingLabel } from '@/components/ui/pending-label'
import { useDesktopAutofocus } from '@/features/auth/use-desktop-autofocus'
import type { JoinStart } from './use-staff-join'

type Values = { name: string; password: string; confirm: string }

/**
 * Step 1 (spec §1): "Join the Vento Real Estate console". A new account sets its name and
 * password; reopening the link after that asks only for the password and goes on at two-step.
 */
export function JoinForm({ preview, join }: { preview: StaffJoinPreview; join: JoinStart }) {
  return preview.resume ? (
    <ResumeForm preview={preview} join={join} />
  ) : (
    <NewForm preview={preview} join={join} />
  )
}

function Intro({ preview }: { preview: StaffJoinPreview }) {
  return (
    <AuthHeader title="Join the Vento Real Estate console">
      {preview.inviterName
        ? `${preview.inviterName} invited you as a super-admin.`
        : "You've been invited as the first super-admin."}
    </AuthHeader>
  )
}

function Email({ email }: { email: string | null }) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>Email</FieldLabel>
      <Input
        id={id}
        type="email"
        name="email"
        autoComplete="username"
        value={email ?? ''}
        readOnly
      />
    </Field>
  )
}

function NewForm({ preview, join }: { preview: StaffJoinPreview; join: JoinStart }) {
  const nameId = useId()
  const form = useForm<Values>({
    defaultValues: { name: preview.name ?? '', password: '', confirm: '' },
    mode: 'onBlur',
  })
  const { errors } = form.formState
  useDesktopAutofocus(() => form.setFocus('name'))

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => join.start(values.password, values.name))}
      className="flex flex-col gap-[18px]"
    >
      <Intro preview={preview} />
      {join.error && <FormAlert variant="error">{join.error}</FormAlert>}
      <Email email={preview.email} />
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
        <Input
          id={nameId}
          autoComplete="name"
          autoCapitalize="words"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          {...form.register('name', {
            setValueAs: (v: string) => v.trim(),
            validate: (v) => v.trim().length > 0 || 'Enter your name',
          })}
        />
        <FieldError id={`${nameId}-error`}>{errors.name?.message}</FieldError>
      </Field>
      <NewPasswordFields
        form={form}
        label="Password"
        username={preview.email ?? undefined}
        serverIssues={join.issues}
        onPasswordChange={join.clearIssues}
      />
      <Button
        type="submit"
        size="lg"
        disabled={join.pending}
        aria-busy={join.pending || undefined}
        className="relative w-full"
      >
        <PendingLabel pending={join.pending}>Continue</PendingLabel>
      </Button>
    </form>
  )
}

function ResumeForm({ preview, join }: { preview: StaffJoinPreview; join: JoinStart }) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [missing, setMissing] = useState(false)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!password) return setMissing(true)
    join.start(password)
  }
  const error = missing ? 'Enter the password you set' : join.fieldError
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-[18px]">
      <Intro preview={preview} />
      <p className="-mt-2 text-muted-foreground text-sm">
        You've already set a password. Enter it to carry on with two-step sign-in.
      </p>
      {join.error && <FormAlert variant="error">{join.error}</FormAlert>}
      <Email email={preview.email} />
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={id}>Password</FieldLabel>
        <PasswordInput
          id={id}
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setMissing(false)
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <FieldError id={`${id}-error`} role="alert">
          {error}
        </FieldError>
      </Field>
      <Button
        type="submit"
        size="lg"
        disabled={join.pending}
        aria-busy={join.pending || undefined}
        className="relative w-full"
      >
        <PendingLabel pending={join.pending}>Continue</PendingLabel>
      </Button>
    </form>
  )
}
