import { findLga, LGAS_BY_STATE, NIGERIAN_STATES, stateLabel } from '@vento/shared'
import { useId } from 'react'
import { useWatch } from 'react-hook-form'
import { NativeSelect } from '@/components/native-select'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import type { ParcelForm } from './parcel-values'

/*
 * State and LGA, both native selects (phones open their own picker; 37 states and up to 44 LGAs
 * a state). The LGA list (774 names) reaches the browser only with this sheet's chunk: the shared
 * schema's LGA check needs it too, so it travels with the form, never with the list page.
 */

export function LgaField({ form }: { form: ParcelForm }) {
  const id = useId()
  const { errors } = form.formState
  const state = useWatch({ control: form.control, name: 'state' })
  const lgas = state ? LGAS_BY_STATE[state] : []
  const stateField = form.register('state', {
    // A new state keeps the LGA only if it's in that state too ("Ikeja" never sits in Ogun).
    onChange: (event: { target: { value: string } }) => {
      const next = NIGERIAN_STATES.find((s) => s === event.target.value)
      const lga = form.getValues('lga')
      const kept = next && lga ? findLga(next, lga) : null
      form.setValue('lga', kept ?? '', { shouldDirty: true, shouldValidate: false })
    },
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-3.5">
      <Field data-invalid={!!errors.state}>
        <FieldLabel htmlFor={`${id}-state`}>State</FieldLabel>
        <NativeSelect
          id={`${id}-state`}
          autoComplete="address-level1"
          aria-invalid={!!errors.state}
          aria-describedby={errors.state ? `${id}-state-error` : undefined}
          {...stateField}
        >
          <option value="" disabled>
            Choose a state
          </option>
          {NIGERIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {stateLabel(s)}
            </option>
          ))}
        </NativeSelect>
        <FieldError id={`${id}-state-error`}>{errors.state?.message}</FieldError>
      </Field>
      <Field data-invalid={!!errors.lga}>
        <FieldLabel htmlFor={`${id}-lga`}>LGA</FieldLabel>
        <NativeSelect
          id={`${id}-lga`}
          disabled={!state}
          autoComplete="off"
          aria-invalid={!!errors.lga}
          aria-describedby={errors.lga ? `${id}-lga-error` : undefined}
          {...form.register('lga')}
        >
          <option value="" disabled>
            {state ? 'Choose an LGA' : 'Choose a state first'}
          </option>
          {lgas.map((lga) => (
            <option key={lga} value={lga}>
              {lga}
            </option>
          ))}
        </NativeSelect>
        <FieldError id={`${id}-lga-error`}>{errors.lga?.message}</FieldError>
      </Field>
    </div>
  )
}
