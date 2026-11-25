import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { entityInput, rcNumberWarning, tinWarning } from '@vento/shared'
import { type ComponentProps, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiErrorMessage, errorReason } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'
import { EntityTypePicker } from './entity-type-picker'
import { OnboardingActions, StepHeader } from './onboarding-layout'

/** Step 2. No collections account here: bank accounts come with Finance (CHANGES.md). */
export function EntityStep({ organizationName }: { organizationName: string }) {
  const ids = { name: useId(), rc: useId(), tin: useId(), vat: useId() }
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm({
    resolver: zodResolver(entityInput),
    defaultValues: {
      name: organizationName,
      type: 'spv',
      rcNumber: '',
      tin: '',
      vatRegistered: false,
    },
  })
  const { errors } = form.formState
  const create = useMutation(
    orpc.onboarding.createFirstEntity.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.account.me.key() })
        void navigate({ to: '/', replace: true })
      },
      onError: (error) => {
        if (errorReason(error) === 'rc_number_taken') {
          form.setError('rcNumber', { message: error.message }, { shouldFocus: true })
        }
      },
    }),
  )
  // Format hints warn but never block: RC and TIN can be fixed later.
  const rcHint = rcNumberWarning(form.watch('rcNumber'))
  const tinHint = tinWarning(form.watch('tin'))
  const showAlert = create.error && errorReason(create.error) !== 'rc_number_taken'

  return (
    <form
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
      noValidate
      className="contents"
    >
      <StepHeader title="First entity">
        Most projects sit in their own company (SPV). Books, bank accounts and tax are kept per
        entity.
      </StepHeader>
      {showAlert && <FormAlert variant="error">{apiErrorMessage(create.error)}</FormAlert>}
      <Controller
        control={form.control}
        name="type"
        render={({ field }) => <EntityTypePicker value={field.value} onChange={field.onChange} />}
      />
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor={ids.name}>Entity name</FieldLabel>
        <Input
          id={ids.name}
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
          hint={rcHint}
          error={errors.rcNumber?.message}
          {...form.register('rcNumber')}
        />
        <CodeField
          id={ids.tin}
          label="TIN"
          placeholder="12345678-0001"
          hint={tinHint}
          error={errors.tin?.message}
          {...form.register('tin')}
        />
      </div>
      <label
        htmlFor={ids.vat}
        className="flex cursor-pointer items-start gap-2.5 border-t py-2.5 text-[13px]"
      >
        <Controller
          control={form.control}
          name="vatRegistered"
          render={({ field }) => (
            <Checkbox
              id={ids.vat}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              className="mt-px"
            />
          )}
        />
        <span className="font-semibold">
          Registered for VAT
          <span className="block font-normal text-muted-foreground text-xs">
            You can change this later in the entity's settings.
          </span>
        </span>
      </label>
      <OnboardingActions>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Finish setup'}
        </Button>
      </OnboardingActions>
    </form>
  )
}

type CodeFieldProps = ComponentProps<'input'> & {
  id: string
  label: string
  hint: string | null
  error?: string | undefined
}

function CodeField({ id, label, hint, error, ...input }: CodeFieldProps) {
  const describedBy = `${id}-hint`
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        className="tabular-nums"
        autoCapitalize="characters"
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <FieldError id={describedBy}>{error}</FieldError>
      ) : (
        <FieldDescription id={describedBy} className={hint ? 'text-status-amber-fg' : undefined}>
          {hint ?? 'You can add this later'}
        </FieldDescription>
      )}
    </Field>
  )
}
