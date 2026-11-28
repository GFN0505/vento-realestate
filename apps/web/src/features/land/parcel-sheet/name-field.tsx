import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useWatch } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { nameTakenText } from '@/features/land/land-words'
import { parcelNameTakenQuery } from '@/features/land/parcels-queries'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import type { ParcelForm } from './parcel-values'

type Props = {
  form: ParcelForm
  /** Edit: the parcel itself never counts as taken. */
  excludeId?: string
  /** Desktop only: the cursor starts here (never pops a phone keyboard). */
  autoFocus: boolean
}

/**
 * Parcel name, with the spec's duplicate hint: "There's already a parcel called Plot 22, Folu
 * Ayo. Open it". A hint, never a block: two parcels may share a name.
 */
export function NameField({ form, excludeId, autoFocus }: Props) {
  const id = useId()
  const error = form.formState.errors.name?.message
  const name = useWatch({ control: form.control, name: 'name' }).trim()
  const settled = useDebouncedValue(name, 400)
  const taken = useQuery({
    ...parcelNameTakenQuery(settled, excludeId),
    enabled: settled.length >= 2 && form.getFieldState('name').isDirty,
  })
  // Only while the box still says what was checked.
  const clash = taken.data && settled === name ? taken.data : null

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Parcel name</FieldLabel>
      <Input
        id={id}
        autoComplete="off"
        autoCapitalize="words"
        autoFocus={autoFocus}
        enterKeyHint="next"
        placeholder="Plot 22, Folu Ayo"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : clash ? `${id}-hint` : undefined}
        {...form.register('name')}
      />
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        clash && (
          <FieldDescription id={`${id}-hint`} aria-live="polite" className="text-status-amber-fg">
            {nameTakenText(clash.name)}{' '}
            <Link
              to="/land/$parcelId"
              params={{ parcelId: clash.id }}
              className="font-semibold text-link underline-offset-4 hover:underline"
            >
              Open it
            </Link>
          </FieldDescription>
        )
      )}
    </Field>
  )
}
