import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { LimitDraft } from './publish-draft'

/** A labelled text field with its error and help, for the Publish sheet. */
export function TextField(props: {
  id: string
  label: string
  value: string
  error: string | undefined
  help?: string
  inputMode?: 'numeric'
  onChange: (value: string) => void
}) {
  const describedBy = props.error
    ? `${props.id}-error`
    : props.help
      ? `${props.id}-help`
      : undefined
  return (
    <Field data-invalid={!!props.error}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        value={props.value}
        inputMode={props.inputMode}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={!!props.error}
        aria-describedby={describedBy}
      />
      <FieldError id={`${props.id}-error`} role="alert">
        {props.error}
      </FieldError>
      {props.help && <FieldDescription id={`${props.id}-help`}>{props.help}</FieldDescription>}
    </Field>
  )
}

/** A count limit: a number, or Unlimited (sent as no limit). */
export function LimitField(props: {
  id: string
  label: string
  value: LimitDraft
  error: string | undefined
  onChange: (value: LimitDraft) => void
}) {
  return (
    <Field data-invalid={!!props.error}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <div className="flex items-center gap-4">
        <Input
          id={props.id}
          type="number"
          inputMode="numeric"
          min={0}
          className="max-w-32"
          value={props.value.unlimited ? '' : props.value.text}
          disabled={props.value.unlimited}
          placeholder={props.value.unlimited ? 'Unlimited' : undefined}
          onChange={(e) => props.onChange({ ...props.value, text: e.target.value })}
          aria-invalid={!!props.error}
          aria-describedby={props.error ? `${props.id}-error` : undefined}
        />
        <label
          htmlFor={`${props.id}-unlimited`}
          className="flex min-h-11 items-center gap-2 text-sm"
        >
          <Switch
            id={`${props.id}-unlimited`}
            checked={props.value.unlimited}
            onCheckedChange={(unlimited) => props.onChange({ ...props.value, unlimited })}
            aria-label={`${props.label}: unlimited`}
          />
          Unlimited
        </label>
      </div>
      <FieldError id={`${props.id}-error`} role="alert">
        {props.error}
      </FieldError>
    </Field>
  )
}
