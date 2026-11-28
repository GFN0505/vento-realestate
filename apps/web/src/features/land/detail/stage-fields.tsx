import { allowsFollowUp, needsNote, type TitleStage } from '@vento/shared'
import { useId } from 'react'
import { type UseFormReturn, useWatch } from 'react-hook-form'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { todayInLagos } from '@/lib/format'
import { cn } from '@/lib/utils'
import { STAGE_STATUS_OPTIONS } from './detail-words'
import type { StageContext, StageFormValues } from './stage-values'

type Props = { form: UseFormReturn<StageFormValues, StageContext>; stage: TitleStage }

/**
 * Status, date, reference, issuer, What happened and Follow up by (board TitleStageUpdate with
 * the DOMAIN words). What happened is asked for where it's needed; Follow up by only for
 * submitted and queried.
 */
export function StageFields({ form, stage }: Props) {
  const id = useId()
  const status = useWatch({ control: form.control, name: 'status' })
  const { errors } = form.formState
  const noteNeeded = needsNote(status) || (stage.status === 'granted' && status !== 'granted')
  const today = todayInLagos()
  const described = (field: keyof StageFormValues) =>
    errors[field] ? `${id}-${field}-error` : undefined

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-[13px]">Status</legend>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'relative inline-flex h-11 cursor-pointer items-center rounded-full border px-3.5 font-semibold text-[13px] transition-colors duration-150 md:h-8 md:px-3 md:text-xs',
                'has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                status === option.value
                  ? 'border-selected-border bg-selected text-selected-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              <input
                type="radio"
                value={option.value}
                className="sr-only"
                {...form.register('status')}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.on}>
          <FieldLabel htmlFor={`${id}-on`}>Date</FieldLabel>
          <Input
            id={`${id}-on`}
            type="date"
            max={today}
            aria-invalid={!!errors.on}
            aria-describedby={described('on')}
            className="tabular-nums"
            {...form.register('on')}
          />
          <FieldError id={`${id}-on-error`}>{errors.on?.message}</FieldError>
        </Field>
        <Field data-invalid={!!errors.reference}>
          <FieldLabel htmlFor={`${id}-reference`}>Reference</FieldLabel>
          <Input
            id={`${id}-reference`}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="e.g. GC/LAG/2026/7781"
            aria-invalid={!!errors.reference}
            aria-describedby={described('reference')}
            className="tabular-nums"
            {...form.register('reference')}
          />
          <FieldError id={`${id}-reference-error`}>{errors.reference?.message}</FieldError>
        </Field>
      </div>
      <Field data-invalid={!!errors.issuedBy}>
        <FieldLabel htmlFor={`${id}-issuedBy`}>Issued by</FieldLabel>
        <Input
          id={`${id}-issuedBy`}
          autoComplete="organization"
          placeholder="Lands Bureau, Lagos"
          aria-invalid={!!errors.issuedBy}
          aria-describedby={described('issuedBy')}
          {...form.register('issuedBy')}
        />
        <FieldError id={`${id}-issuedBy-error`}>{errors.issuedBy?.message}</FieldError>
      </Field>
      <Field data-invalid={!!errors.note}>
        <FieldLabel htmlFor={`${id}-note`}>
          What happened
          {!noteNeeded && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </FieldLabel>
        <Textarea
          id={`${id}-note`}
          rows={3}
          placeholder={
            status === 'queried'
              ? 'e.g. Lands Bureau asked for the survey plan to be re-certified'
              : status === 'rejected'
                ? 'e.g. Refused: the survey plan was not charted'
                : undefined
          }
          aria-invalid={!!errors.note}
          aria-describedby={described('note')}
          {...form.register('note')}
        />
        <FieldError id={`${id}-note-error`}>{errors.note?.message}</FieldError>
      </Field>
      {allowsFollowUp(status) && (
        <Field data-invalid={!!errors.followUpOn} className="sm:max-w-[calc(50%-0.5rem)]">
          <FieldLabel htmlFor={`${id}-followUpOn`}>
            Follow up by <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id={`${id}-followUpOn`}
            type="date"
            min={today}
            aria-invalid={!!errors.followUpOn}
            aria-describedby={`${id}-followUpOn-hint`}
            className="tabular-nums"
            {...form.register('followUpOn')}
          />
          <p id={`${id}-followUpOn-hint`} className="text-muted-foreground text-xs">
            It shows in your Home queue on that day.
          </p>
          <FieldError>{errors.followUpOn?.message}</FieldError>
        </Field>
      )}
    </>
  )
}
