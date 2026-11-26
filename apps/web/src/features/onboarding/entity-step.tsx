import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { entityInput } from '@vento/shared'
import { useId } from 'react'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CompanyFields, type CompanyFieldValues } from '@/features/companies/sheet/company-fields'
import { apiErrorMessage, errorReason } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'
import { OnboardingActions, StepHeader } from './onboarding-layout'

/** Step 2. No collections account here: bank accounts come with Finance (CHANGES.md). */
export function EntityStep({ organizationName }: { organizationName: string }) {
  const vatId = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm<CompanyFieldValues>({
    // The schema turns blank RC and TIN into null; the form keeps strings for the inputs.
    resolver: zodResolver(entityInput) as unknown as Resolver<CompanyFieldValues>,
    defaultValues: {
      name: organizationName,
      type: 'spv',
      rcNumber: '',
      tin: '',
      vatRegistered: false,
    },
  })
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
  const showAlert = create.error && errorReason(create.error) !== 'rc_number_taken'

  return (
    <form
      onSubmit={form.handleSubmit((values) => create.mutate(entityInput.parse(values)))}
      noValidate
      className="contents"
    >
      <StepHeader title="First company">
        Most projects sit in their own company (SPV). Books, bank accounts and tax are kept per
        company.
      </StepHeader>
      {showAlert && <FormAlert variant="error">{apiErrorMessage(create.error)}</FormAlert>}
      <CompanyFields form={form} />
      <label
        htmlFor={vatId}
        className="flex cursor-pointer items-start gap-2.5 border-t py-2.5 text-[13px]"
      >
        <Controller
          control={form.control}
          name="vatRegistered"
          render={({ field }) => (
            <Checkbox
              id={vatId}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              className="mt-px"
            />
          )}
        />
        <span className="font-semibold">
          Registered for VAT
          <span className="block font-normal text-muted-foreground text-xs">
            You can change this later under Settings → Companies.
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
