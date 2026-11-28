import {
  DEFAULT_PLOT_SQM,
  hectares,
  SIZE_UNIT_LABELS,
  SIZE_UNITS,
  type SizeEntry,
  toSqm,
} from '@vento/shared'
import { useId } from 'react'
import { useWatch } from 'react-hook-form'
import { NativeSelect } from '@/components/native-select'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { ParcelForm } from './parcel-values'

const SIZE = /^\d{1,10}(\.\d{1,4})?$/
const PLOT = /^\d{1,8}(\.\d{1,2})?$/

const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** "7200.00" → "7,200", "1250.50" → "1,250.5". */
function squareMetres(sqm: string): string {
  const [whole = '0', fraction = ''] = sqm.split('.')
  const rest = fraction.replace(/0+$/, '')
  return `${grouped(whole)}${rest ? `.${rest}` : ''} m²`
}

/**
 * The line under Size, worked out as it's typed: hectares show their m², m² and plots show
 * hectares (spec: "12 plots (0.72 ha)"). null while the size isn't a number yet.
 */
export function sizeSummary(entry: SizeEntry): string | null {
  const value = entry.value.trim()
  if (!SIZE.test(value) || /^0+(\.0+)?$/.test(value)) return null
  const plot = entry.plotSizeSqm?.trim() ?? ''
  if (entry.unit === 'plots' && plot && (!PLOT.test(plot) || /^0+(\.0+)?$/.test(plot))) return null
  const sqm = toSqm({ value, unit: entry.unit, plotSizeSqm: plot || null })
  const ha = `${hectares(sqm)} ha`
  if (entry.unit === 'ha') return `= ${squareMetres(sqm)}`
  if (entry.unit === 'sqm') return `= ${ha}`
  return `= ${squareMetres(sqm)} (${ha})`
}

/** Size and its unit side by side; plots ask for the plot size (600 m² unless it says). */
export function SizeField({ form }: { form: ParcelForm }) {
  const id = useId()
  const { errors } = form.formState
  const size = useWatch({ control: form.control, name: 'size' })
  const summary = sizeSummary(size)
  const error = errors.size?.value?.message
  const plotError = errors.size?.plotSizeSqm?.message
  const describedBy = `${id}-line`

  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`${id}-value`}>Size</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`${id}-value`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={size.unit === 'plots' ? '12' : size.unit === 'ha' ? '4.2' : '1200'}
            enterKeyHint="next"
            aria-invalid={!!error}
            aria-describedby={error || summary ? describedBy : undefined}
            className="min-w-0 flex-1 tabular-nums"
            {...form.register('size.value')}
          />
          <div className="w-40 shrink-0">
            <NativeSelect aria-label="Size unit" {...form.register('size.unit')}>
              {SIZE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {SIZE_UNIT_LABELS[unit]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {error ? (
          <FieldError id={describedBy}>{error}</FieldError>
        ) : (
          // Always one line, so the worked-out size never pushes the fields below.
          <FieldDescription id={describedBy} aria-live="polite" className="tabular-nums">
            {summary ?? ' '}
          </FieldDescription>
        )}
      </Field>
      {size.unit === 'plots' && (
        <Field data-invalid={!!plotError}>
          <FieldLabel htmlFor={`${id}-plot`}>Plot size</FieldLabel>
          <div className="relative">
            <Input
              id={`${id}-plot`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={DEFAULT_PLOT_SQM.replace('.00', '')}
              aria-invalid={!!plotError}
              aria-describedby={`${id}-plot-line`}
              className="pr-12 tabular-nums"
              {...form.register('size.plotSizeSqm')}
            />
            <span
              aria-hidden
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-sm"
            >
              m²
            </span>
          </div>
          {plotError ? (
            <FieldError id={`${id}-plot-line`}>{plotError}</FieldError>
          ) : (
            <FieldDescription id={`${id}-plot-line`}>
              Leave empty for the usual 600 m² plot.
            </FieldDescription>
          )}
        </Field>
      )}
    </div>
  )
}
