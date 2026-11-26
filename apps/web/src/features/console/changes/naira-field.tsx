import { useId } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/** "₦150,000" or "150 000" → "150000"; empty stays empty. Money stays a string. */
export function cleanNaira(text: string): string {
  return text.replace(/[₦,\s]/g, '')
}

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error: string | null
  help?: string
  disabled?: boolean
  id?: string
}

/** A naira amount (AI budget): ₦ prefix, decimal keypad, digits with commas allowed. */
export function NairaField({ label, value, onChange, onBlur, error, help, disabled, id }: Props) {
  const own = useId()
  const fieldId = id ?? own
  return (
    <Field data-invalid={!!error} className="max-w-60">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <div className="relative">
        <span
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground text-sm"
        >
          ₦
        </span>
        <Input
          id={fieldId}
          name="budget"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined}
          className="pl-7 tabular-nums"
        />
      </div>
      <FieldError id={`${fieldId}-error`} role="alert">
        {error}
      </FieldError>
      {help && <FieldDescription id={`${fieldId}-help`}>{help}</FieldDescription>}
    </Field>
  )
}
