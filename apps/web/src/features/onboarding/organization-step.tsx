import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createOrganizationInput, MONTHS, NIGERIAN_STATES, stateLabel } from '@vento/shared'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiErrorMessage } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'
import { OnboardingActions, StepHeader } from './onboarding-layout'

/** Step 1. No RC number or logo here, and NGN is fixed (CHANGES.md). */
export function OrganizationStep({ companyName }: { companyName: string | null }) {
  const ids = { name: useId(), state: useId(), fy: useId(), currency: useId() }
  const queryClient = useQueryClient()
  const form = useForm({
    resolver: zodResolver(createOrganizationInput),
    defaultValues: { name: companyName ?? '', financialYearStartMonth: 1 },
  })
  const { errors } = form.formState
  const create = useMutation(
    orpc.onboarding.createOrganization.mutationOptions({
      // The server moves `nextStep` on; the page follows it.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.account.me.key() }),
    }),
  )

  return (
    <form
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
      noValidate
      className="contents"
    >
      <StepHeader title="Your organization">
        The developer group as a whole. Project companies come next.
      </StepHeader>
      {create.error && <FormAlert variant="error">{apiErrorMessage(create.error)}</FormAlert>}
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor={ids.name}>Organization name</FieldLabel>
        <Input
          id={ids.name}
          autoComplete="organization"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          {...form.register('name')}
        />
        <FieldError id={`${ids.name}-error`}>{errors.name?.message}</FieldError>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3.5">
        <Field data-invalid={!!errors.headOfficeState}>
          <FieldLabel htmlFor={ids.state}>Head office state</FieldLabel>
          <NativeSelect
            id={ids.state}
            required
            defaultValue=""
            aria-invalid={!!errors.headOfficeState}
            aria-describedby={errors.headOfficeState ? `${ids.state}-error` : undefined}
            {...form.register('headOfficeState')}
          >
            <option value="" disabled>
              Choose a state
            </option>
            {NIGERIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ))}
          </NativeSelect>
          <FieldError id={`${ids.state}-error`}>{errors.headOfficeState?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.fy}>Financial year starts</FieldLabel>
          <NativeSelect
            id={ids.fy}
            {...form.register('financialYearStartMonth', { valueAsNumber: true })}
          >
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={ids.currency}>Base currency</FieldLabel>
        <Input
          id={ids.currency}
          value="NGN (naira)"
          readOnly
          aria-describedby={`${ids.currency}-hint`}
        />
        <FieldDescription id={`${ids.currency}-hint`}>
          Every entity keeps its books in naira. Foreign receipts are recorded with their rate.
        </FieldDescription>
      </Field>
      <OnboardingActions>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </OnboardingActions>
    </form>
  )
}
