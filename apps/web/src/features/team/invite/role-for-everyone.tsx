import type { Role } from '@vento/shared'
import { type Ref, useId } from 'react'
import { FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { approveNote, twoStepNote } from '../role-notes'

type Props = {
  roles: readonly Role[] | undefined
  value: string | null
  onChange: (roleId: string) => void
  error: string | null
  triggerRef: Ref<HTMLButtonElement>
  /** "Role" in the invite sheet, where it applies to every row. */
  label?: string
  joining: boolean
}

/**
 * The role picker with one line per role ("Sales: leads, units, subscriptions…") and, under it,
 * what the chosen role can approve and whether it needs two-step sign-in. No preset: nobody is
 * made an owner or admin by accident.
 */
export function RoleField({
  roles,
  value,
  onChange,
  error,
  triggerRef,
  label = 'Role',
  joining,
}: Props) {
  const id = useId()
  const chosen = roles?.find((r) => r.id === value)
  const notes = chosen ? [approveNote(chosen), twoStepNote(chosen, joining)].filter(Boolean) : []
  if (!roles) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-sm">{label}</span>
        <Skeleton className="h-12 w-full md:h-10" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger
          ref={triggerRef}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : notes.length ? `${id}-notes` : undefined}
        >
          <SelectValue placeholder="Choose a role" />
        </SelectTrigger>
        <SelectContent className="max-w-[min(420px,calc(100vw-2rem))]">
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id} description={role.description}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`}>{error}</FieldError>
      {notes.length > 0 && (
        <div id={`${id}-notes`} className="flex flex-col gap-0.5">
          {notes.map((note) => (
            <FieldDescription key={note}>{note}</FieldDescription>
          ))}
        </div>
      )}
    </div>
  )
}
