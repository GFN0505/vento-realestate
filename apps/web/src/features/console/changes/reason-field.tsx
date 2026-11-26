import { useEffect, useId, useRef } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error: string | null
  disabled?: boolean
  autoFocus?: boolean
}

/** Spec: label "Reason", helper "Kept in Vento's activity. The customer doesn't see it." */
export function ReasonField({ value, onChange, onBlur, error, disabled, autoFocus }: Props) {
  const id = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  // Desktop only (the caller checks the pointer): never pop the keyboard on a phone.
  useEffect(() => {
    if (autoFocus) field.current?.focus({ preventScroll: true })
  }, [autoFocus])
  const help = `${id}-help`
  const err = `${id}-error`
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Reason</FieldLabel>
      <textarea
        id={id}
        name="reason"
        value={value}
        rows={3}
        maxLength={500}
        ref={field}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${err} ${help}` : help}
        className={cn(
          'min-h-[84px] w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-input-hover md:text-sm',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
          'aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />
      <FieldError id={err} role="alert">
        {error}
      </FieldError>
      <FieldDescription id={help}>
        Kept in Vento's activity. The customer doesn't see it.
      </FieldDescription>
    </Field>
  )
}
