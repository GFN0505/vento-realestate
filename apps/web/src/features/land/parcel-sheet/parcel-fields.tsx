import type { Entity } from '@vento/shared'
import { useId } from 'react'
import { NativeSelect } from '@/components/native-select'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CHOSEN_STATUS_OPTIONS } from '@/features/land/land-words'
import { LgaField } from './lga-field'
import { NameField } from './name-field'
import type { ParcelForm } from './parcel-values'
import { SizeField } from './size-field'

type Props = {
  form: ParcelForm
  /** The companies this person may put a parcel under (the switcher's list). */
  companies: readonly Entity[]
  /** Edit: the parcel's own id, so its name isn't "taken". */
  excludeId?: string
  autoFocusName: boolean
  /** Projects and Sales set the status from here on (in development, sold out). */
  statusLocked?: string | null
  /** Under Status: "Opens as Titled…" when every stage has its document. */
  statusNote?: string | null
}

/** The essentials of Add / Edit parcel (spec: name, state, LGA, area, size, status, company). */
export function ParcelFields({
  form,
  companies,
  excludeId,
  autoFocusName,
  statusLocked,
  statusNote,
}: Props) {
  const id = useId()
  const { errors } = form.formState
  return (
    <>
      <NameField form={form} excludeId={excludeId} autoFocus={autoFocusName} />
      <LgaField form={form} />
      <Field data-invalid={!!errors.area}>
        <FieldLabel htmlFor={`${id}-area`}>Area or town</FieldLabel>
        <Input
          id={`${id}-area`}
          autoComplete="address-level2"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Ibeju-Lekki"
          aria-invalid={!!errors.area}
          {...form.register('area')}
        />
        <FieldError>{errors.area?.message}</FieldError>
      </Field>
      <SizeField form={form} />
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3.5">
        <Field>
          <FieldLabel htmlFor={`${id}-status`}>Status</FieldLabel>
          {statusLocked ? (
            <p id={`${id}-status`} className="flex h-10 items-center text-sm">
              {statusLocked}
            </p>
          ) : (
            <NativeSelect id={`${id}-status`} {...form.register('status')}>
              {CHOSEN_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          )}
          {statusNote && (
            <FieldDescription className="text-status-emerald-fg">{statusNote}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.entityId}>
          <FieldLabel htmlFor={`${id}-company`}>Company</FieldLabel>
          <NativeSelect
            id={`${id}-company`}
            aria-invalid={!!errors.entityId}
            {...form.register('entityId')}
          >
            <option value="" disabled>
              Choose a company
            </option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError>{errors.entityId && 'Choose the company that holds this land'}</FieldError>
        </Field>
      </div>
    </>
  )
}
