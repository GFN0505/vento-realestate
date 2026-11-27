import { useId, useState } from 'react'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { consoleClient } from '../api'
import { ChangeSheet } from '../changes/change-sheet'
import { useChange } from '../changes/use-change'
import { useResendInvitation } from './use-resend-invitation'

const invite = consoleClient.console.superAdmins.invite
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = { email?: string; name?: string }

function check(email: string, name: string): Errors {
  return {
    ...(!EMAIL.test(email.trim()) && { email: 'Enter an email address, like tunde@ventoerp.com' }),
    ...(name.trim().length === 0 && { name: "Enter the person's name" }),
  }
}

/**
 * Invite super-admin (spec 1b): email and name, then the review ("…gets an email to join. The
 * link works for 48 hours.") and a reason → **Send invitation**. An open invitation for that
 * email offers **Resend** instead.
 */
export function InviteSheet({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const ids = { email: useId(), name: useId() }
  const change = useChange(invite, onClose)
  const resend = useResendInvitation()
  const shown = name.trim() || 'this person'

  return (
    <ChangeSheet
      open
      onClose={onClose}
      change={change}
      title="Invite super-admin"
      description="They'll be able to change every organization's plan and features."
      reviewTitle={`Invite ${shown} to be a super-admin?`}
      confirmLabel="Send invitation"
      fieldsDirty={email.trim() !== '' || name.trim() !== ''}
      onNext={(next, invitationId) => {
        if (next !== 'resend_invitation' || !invitationId) return
        resend.mutate(invitationId, { onSuccess: onClose })
      }}
      onReview={() => {
        const found = check(email, name)
        setErrors(found)
        const first = (['email', 'name'] as const).find((k) => found[k])
        if (first) return document.getElementById(ids[first])?.focus()
        void change.preview({ email: email.trim().toLowerCase(), name: name.trim() })
      }}
      fields={
        <>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor={ids.email}>Email</FieldLabel>
            <Input
              id={ids.email}
              type="email"
              name="email"
              autoComplete="off"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (errors.email) setErrors({ ...errors, email: undefined })
              }}
              onBlur={() =>
                email.trim() !== '' &&
                setErrors({ ...errors, ...pick(check(email, name), 'email') })
              }
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? `${ids.email}-error` : undefined}
            />
            <FieldError id={`${ids.email}-error`} role="alert">
              {errors.email}
            </FieldError>
          </Field>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
            <Input
              id={ids.name}
              name="name"
              autoComplete="off"
              autoCapitalize="words"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors({ ...errors, name: undefined })
              }}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${ids.name}-error` : undefined}
            />
            <FieldError id={`${ids.name}-error`} role="alert">
              {errors.name}
            </FieldError>
          </Field>
        </>
      }
    />
  )
}

function pick(errors: Errors, key: keyof Errors): Errors {
  return { [key]: errors[key] }
}
