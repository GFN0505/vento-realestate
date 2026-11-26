import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MONTHS,
  NIGERIAN_STATES,
  type Organization,
  stateLabel,
  updateOrganizationInput,
} from '@vento/shared'
import { type ReactNode, useId } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { NativeSelect } from '@/components/native-select'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { financialYearSpan } from '@/lib/format'
import { orpc } from '@/lib/orpc'
import { organizationQuery } from './organization-queries'

/** The shared update schema's values; every field is filled from the organization. */
export type OrganizationValues = ReturnType<typeof updateOrganizationInput.parse>

export const ORGANIZATION_FORM_ID = 'organization-form'

const valuesOf = (org: Organization): OrganizationValues => ({
  name: org.name,
  headOfficeState: org.headOfficeState,
  financialYearStartMonth: org.financialYearStartMonth,
})

/** The form, owned by the page so its header button and the leave guard know when it's dirty. */
export function useOrganizationForm(org: Organization) {
  const queryClient = useQueryClient()
  const form = useForm<OrganizationValues>({
    resolver: zodResolver(updateOrganizationInput),
    defaultValues: valuesOf(org),
    mode: 'onTouched',
  })
  const save = useMutation(
    orpc.organization.update.mutationOptions({
      onSuccess: (saved) => {
        // The saved values become the new starting point (the form is clean again).
        form.reset(valuesOf(saved))
        queryClient.setQueryData(organizationQuery().queryKey, saved)
        // The sidebar, the organization menu and the switcher show the name from `me`.
        void queryClient.invalidateQueries({ queryKey: orpc.account.me.key() })
        toast.success('Organization details saved')
      },
    }),
  )
  const submit = form.handleSubmit((values) => {
    // Only what changed, so two owners saving different fields at once both win (spec).
    const dirty = form.formState.dirtyFields
    save.mutate({
      ...(dirty.name ? { name: values.name } : {}),
      ...(dirty.headOfficeState ? { headOfficeState: values.headOfficeState } : {}),
      ...(dirty.financialYearStartMonth
        ? { financialYearStartMonth: values.financialYearStartMonth }
        : {}),
    })
  })
  return { form, save, submit }
}

type Props = { org: Organization; editable: boolean } & ReturnType<typeof useOrganizationForm>

/** Board SetOrg, its Company and Defaults cards cut to what Vento uses today. */
export function OrganizationForm({ org, editable, form, save, submit }: Props) {
  const ids = { name: useId(), state: useId(), fy: useId(), currency: useId() }
  const { errors } = form.formState
  const start = Number(form.watch('financialYearStartMonth')) || org.financialYearStartMonth

  return (
    <form
      id={ORGANIZATION_FORM_ID}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5"
    >
      <SaveErrorAlert error={save.error} />
      <fieldset disabled={!editable} className="contents">
        <Section
          title="Name and head office"
          description="Shown in the sidebar, on emails your team receives and on documents."
        >
          <Field data-invalid={!!errors.name} className="sm:col-span-2">
            <FieldLabel htmlFor={ids.name}>Organization name</FieldLabel>
            <Input
              id={ids.name}
              autoComplete="organization"
              enterKeyHint="done"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${ids.name}-error` : undefined}
              {...form.register('name')}
            />
            <FieldError id={`${ids.name}-error`}>{errors.name?.message}</FieldError>
          </Field>
          <Field data-invalid={!!errors.headOfficeState}>
            <FieldLabel htmlFor={ids.state}>Head office state</FieldLabel>
            <NativeSelect
              id={ids.state}
              aria-invalid={!!errors.headOfficeState}
              {...form.register('headOfficeState')}
            >
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {stateLabel(state)}
                </option>
              ))}
            </NativeSelect>
            <FieldError>{errors.headOfficeState?.message}</FieldError>
          </Field>
        </Section>

        <Section title="Defaults" description="How Vento keeps your books and reports.">
          <Field>
            <FieldLabel htmlFor={ids.fy}>Financial year starts in</FieldLabel>
            <NativeSelect
              id={ids.fy}
              aria-describedby={`${ids.fy}-hint`}
              {...form.register('financialYearStartMonth', { valueAsNumber: true })}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription id={`${ids.fy}-hint`}>
              <span className="font-medium text-foreground tabular-nums">
                {financialYearSpan(start)}
              </span>
              . Your books and reports use this year.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.currency}>Base currency</FieldLabel>
            <Input
              id={ids.currency}
              value="NGN · ₦"
              readOnly
              tabIndex={-1}
              className="bg-muted text-foreground"
              aria-describedby={`${ids.currency}-hint`}
            />
            <FieldDescription id={`${ids.currency}-hint`}>
              Every company keeps its books in naira. Foreign receipts carry their rate.
            </FieldDescription>
          </Field>
        </Section>
      </fieldset>
    </form>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[12px] border bg-card">
      <header className="flex flex-col gap-0.5 border-b px-5 py-4 sm:px-6">
        <h2 className="font-heading font-semibold text-[15px] tracking-[-0.01em]">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </header>
      <div className="grid gap-x-4 gap-y-5 px-5 py-5 sm:grid-cols-2 sm:px-6">{children}</div>
    </section>
  )
}
