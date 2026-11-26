import {
  type EntityType,
  normaliseRcNumber,
  normaliseTin,
  rcNumberWarning,
  tinWarning,
} from '@vento/shared'
import { type ComponentProps, useId } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { EntityTypePicker } from '@/features/onboarding/entity-type-picker'

/** What the company fields edit. VAT stays with each form (a switch in the sheet). */
export type CompanyFieldValues = {
  name: string
  type: EntityType
  rcNumber: string
  tin: string
  vatRegistered: boolean
}

type Props = {
  form: UseFormReturn<CompanyFieldValues>
  nameLabel?: string
  /** Desktop only: the cursor starts in the name (never pops a phone keyboard). */
  autoFocusName?: boolean
}

/**
 * Name, type, RC number and TIN: one source for onboarding's first company and the Company sheet.
 * RC and TIN are tidied on blur ("rc-1789234" → "RC 1789234"); format hints warn, never block.
 */
export function CompanyFields({ form, nameLabel = 'Company name', autoFocusName = false }: Props) {
  const ids = { name: useId(), rc: useId(), tin: useId() }
  const { errors } = form.formState
  const rcHint = rcNumberWarning(form.watch('rcNumber'))
  const tinHint = tinWarning(form.watch('tin'))
  const tidy = (field: 'rcNumber' | 'tin', normalise: (v: string) => string) => () => {
    const value = form.getValues(field).trim()
    const next = value ? normalise(value) : ''
    if (next !== form.getValues(field)) form.setValue(field, next, { shouldDirty: true })
  }

  return (
    <>
      <Controller
        control={form.control}
        name="type"
        render={({ field }) => <EntityTypePicker value={field.value} onChange={field.onChange} />}
      />
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor={ids.name}>{nameLabel}</FieldLabel>
        <Input
          id={ids.name}
          autoComplete="organization"
          autoFocus={autoFocusName}
          enterKeyHint="next"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          {...form.register('name')}
        />
        <FieldError id={`${ids.name}-error`}>{errors.name?.message}</FieldError>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3.5">
        <CodeField
          id={ids.rc}
          label="RC number"
          placeholder="RC 1234567"
          inputMode="text"
          autoCapitalize="characters"
          hint={rcHint}
          filled={Boolean(form.watch('rcNumber'))}
          error={errors.rcNumber?.message}
          {...form.register('rcNumber', { onBlur: tidy('rcNumber', normaliseRcNumber) })}
        />
        <CodeField
          id={ids.tin}
          label="TIN"
          placeholder="12345678-0001"
          inputMode="numeric"
          hint={tinHint}
          filled={Boolean(form.watch('tin'))}
          error={errors.tin?.message}
          {...form.register('tin', { onBlur: tidy('tin', normaliseTin) })}
        />
      </div>
    </>
  )
}

type CodeFieldProps = ComponentProps<'input'> & {
  id: string
  label: string
  hint: string | null
  error?: string | undefined
  /** Once there's a value, "You can add this later" no longer applies (the line keeps its room). */
  filled: boolean
}

function CodeField({ id, label, hint, error, filled, ...input }: CodeFieldProps) {
  const describedBy = `${id}-hint`
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        className="tabular-nums"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <FieldError id={describedBy}>{error}</FieldError>
      ) : (
        // One line, always there, so a warning never pushes the fields below it.
        <FieldDescription id={describedBy} className={hint ? 'text-status-amber-fg' : undefined}>
          {hint ?? (filled ? '\u00a0' : 'You can add this later')}
        </FieldDescription>
      )}
    </Field>
  )
}
