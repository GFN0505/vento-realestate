import { zodResolver } from '@hookform/resolvers/zod'
import { type Entity, entityInput } from '@vento/shared'
import { ArchiveRestoreIcon } from 'lucide-react'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PlanLimitMessage } from '@/features/plan/plan-limit-message'
import { isPlanLimit } from '@/lib/error-data'
import {
  CompanyFields,
  type CompanyFieldValues,
  type CompanyForm as CompanyFormApi,
  type CompanyValues,
} from './company-fields'
import type { useSaveCompany } from './use-save-company'

export const COMPANY_FORM_ID = 'company-form'

export function useCompanyForm(company: Entity | null) {
  return useForm<CompanyFieldValues, unknown, CompanyValues>({
    resolver: zodResolver(entityInput),
    mode: 'onTouched',
    defaultValues: company
      ? {
          name: company.name,
          type: company.type,
          rcNumber: company.rcNumber ?? '',
          tin: company.tin ?? '',
          vatRegistered: company.vatRegistered,
        }
      : // Add: a project company (SPV) is the usual case (spec).
        { name: '', type: 'spv', rcNumber: '', tin: '', vatRegistered: false },
  })
}

type Props = {
  form: CompanyFormApi
  save: ReturnType<typeof useSaveCompany>
  onSubmit: (values: CompanyValues) => void
  autoFocusName: boolean
  /** May restore an archived company that already has the RC number. */
  canRestore: boolean
}

/** The fields of the Company sheet, add or edit. Enter submits; nothing typed is ever lost. */
export function CompanyForm({ form, save, onSubmit, autoFocusName, canRestore }: Props) {
  const vatId = useId()
  return (
    <form
      id={COMPANY_FORM_ID}
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-5"
    >
      <CompanyFields form={form} autoFocusName={autoFocusName} />
      {save.clash && canRestore && (
        <div className="-mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px]">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {save.clash.name} is archived.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={save.pending}
            onClick={() => save.clash && void save.restoreInstead(save.clash)}
            className="max-md:h-11"
          >
            <ArchiveRestoreIcon aria-hidden />
            Restore it instead
          </Button>
        </div>
      )}
      <label
        htmlFor={vatId}
        className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border px-3.5 py-3"
      >
        <span className="flex flex-col">
          <span className="font-semibold text-sm">VAT registered</span>
          <span className="text-muted-foreground text-xs">
            Turn on once the company charges VAT.
          </span>
        </span>
        <Controller
          control={form.control}
          name="vatRegistered"
          render={({ field }) => (
            <Switch id={vatId} checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </label>
    </form>
  )
}

/** Above the buttons: the plan's limit (fields stay), or why a save didn't go through. */
export function CompanySaveError({ error }: { error: unknown }) {
  if (isPlanLimit(error)) return <PlanLimitMessage error={error} />
  return <SaveErrorAlert error={error} />
}
