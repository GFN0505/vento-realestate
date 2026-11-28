import { ChevronDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Controller } from 'react-hook-form'
import { MoneyInput } from '@/components/money-input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { todayInLagos } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ParcelForm } from './parcel-values'

type Props = {
  form: ParcelForm
  /**
   * The acquisition (date, cost, Bought from): Land & title edit or Finance view (open
   * question 5). Without it only Notes is here.
   */
  showMoney: boolean
  /** Open from the start, e.g. editing a parcel that already has these filled in. */
  defaultOpen: boolean
}

/** Progressive disclosure (spec): acquisition date, cost, who it was bought from, notes. */
export function MoreOptions({ form, showMoney, defaultOpen }: Props) {
  const id = useId()
  const { errors } = form.formState
  // An error inside opens it, so the focused field is never hidden.
  const hasError = Boolean(
    errors.acquiredOn || errors.acquisitionCost || errors.seller || errors.notes,
  )
  const [open, setOpen] = useState(defaultOpen)
  const shown = open || hasError

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(!shown)}
        className="-mx-1 flex min-h-11 items-center gap-1.5 self-start rounded-md px-1 font-semibold text-[13px] text-link outline-hidden hover:text-link-hover focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring md:min-h-8"
      >
        More options
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'size-4 transition-transform duration-150 motion-reduce:transition-none',
            shown && 'rotate-180',
          )}
        />
      </button>
      <div id={`${id}-panel`} hidden={!shown} className="flex flex-col gap-4">
        {showMoney && (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-3.5">
            <Field data-invalid={!!errors.acquiredOn}>
              <FieldLabel htmlFor={`${id}-on`}>Acquisition date</FieldLabel>
              <Input
                id={`${id}-on`}
                type="date"
                max={todayInLagos()}
                className="tabular-nums"
                aria-invalid={!!errors.acquiredOn}
                {...form.register('acquiredOn')}
              />
              <FieldError>{errors.acquiredOn?.message}</FieldError>
            </Field>
            <Field data-invalid={!!errors.acquisitionCost}>
              <FieldLabel htmlFor={`${id}-cost`}>Acquisition cost</FieldLabel>
              <Controller
                control={form.control}
                name="acquisitionCost"
                render={({ field }) => (
                  <MoneyInput
                    id={`${id}-cost`}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="840,000,000"
                    aria-invalid={!!errors.acquisitionCost}
                  />
                )}
              />
              <FieldError>{errors.acquisitionCost?.message}</FieldError>
            </Field>
          </div>
        )}
        {showMoney && (
          <Field data-invalid={!!errors.seller}>
            <FieldLabel htmlFor={`${id}-seller`}>Bought from</FieldLabel>
            <Input
              id={`${id}-seller`}
              autoComplete="off"
              autoCapitalize="words"
              placeholder="Adeyemi family"
              aria-invalid={!!errors.seller}
              {...form.register('seller')}
            />
            <FieldError>{errors.seller?.message}</FieldError>
          </Field>
        )}
        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
          <Textarea id={`${id}-notes`} rows={3} {...form.register('notes')} />
          <FieldError>{errors.notes?.message}</FieldError>
        </Field>
      </div>
    </div>
  )
}
