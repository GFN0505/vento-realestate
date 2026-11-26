import type { SuperAdminRow } from '@vento/shared/console'
import { useId, useState } from 'react'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { consoleClient } from '../api'
import { ChangeDialog } from '../changes/change-dialog'
import { ChangeSheet } from '../changes/change-sheet'
import { useChange } from '../changes/use-change'
import { firstName, nameFromEmail } from './queries'

const add = consoleClient.console.superAdmins.add
const remove = consoleClient.console.superAdmins.remove
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Add super-admin (spec): the email of an existing Vento account with two-step on. */
export function AddSuperAdminSheet({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const change = useChange(add, onClose)
  const check = () =>
    EMAIL.test(email.trim()) ? null : 'Enter an email address, like tunde@ventoerp.com'
  return (
    <ChangeSheet
      open
      onClose={onClose}
      change={change}
      title="Add super-admin"
      description="They can change every organization's plan and features from the Vento console."
      reviewTitle={`Make ${nameFromEmail(email)} a super-admin?`}
      confirmLabel={`Make ${nameFromEmail(email)} a super-admin`}
      fieldsDirty={email.trim() !== ''}
      onReview={() => {
        const problem = check()
        setError(problem)
        if (problem) return document.getElementById(id)?.focus()
        void change.preview({ email: email.trim() })
      }}
      fields={
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={id}>Email</FieldLabel>
          <Input
            id={id}
            type="email"
            name="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (error) setError(null)
            }}
            onBlur={() => email.trim() !== '' && setError(check())}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <FieldError id={`${id}-error`} role="alert">
            {error}
          </FieldError>
        </Field>
      }
    />
  )
}

/** Remove (spec): never on your own row; the API refuses it too. */
export function RemoveSuperAdminDialog({
  row,
  onClose,
}: {
  row: SuperAdminRow
  onClose: () => void
}) {
  const change = useChange(remove, onClose)
  return (
    <ChangeDialog
      open
      onClose={onClose}
      change={change}
      title={`Remove ${row.name} as a super-admin?`}
      description="They lose the Vento console at once. Their own organizations aren't affected."
      confirmLabel={`Remove ${firstName(row.name)}`}
      destructive
      autoPreview={() => void change.preview({ userId: row.userId })}
    />
  )
}
