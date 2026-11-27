import { useQuery } from '@tanstack/react-query'
import {
  APPROVAL_ACTIONS,
  APPROVAL_COPY,
  MODULE_LABELS,
  type PermissionModule,
  RULE_ACTION_KEYS,
} from '@vento/shared'
import { LockIcon } from 'lucide-react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { NativeSelect } from '@/components/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { EntityAccessField } from '@/features/team/entity-access-field'
import type { RuleValues } from './rule-form'
import { StepBuilder } from './step-builder'

export const RULE_FORM_ID = 'approval-rule-form'

/** The catalog's rule actions, grouped by module for the Action list. */
const BY_MODULE = RULE_ACTION_KEYS.reduce<
  Map<PermissionModule, (typeof RULE_ACTION_KEYS)[number][]>
>((groups, key) => {
  const module = APPROVAL_ACTIONS[key].module
  groups.set(module, [...(groups.get(module) ?? []), key])
  return groups
}, new Map())

/**
 * The rule sheet's fields (board Edit rule): Action · When · Approvers in order · Companies, the
 * locked "Requester can't approve" tick, and the action's fixed extra condition.
 */
export function RuleFields({
  form,
  onSubmit,
}: {
  form: UseFormReturn<RuleValues>
  onSubmit: () => void
}) {
  const roles = useQuery(rolesQuery())
  const entities = useQuery(entitiesQuery())
  const actionKey = form.watch('actionKey')
  const whenKind = form.watch('whenKind')
  const meta = APPROVAL_ACTIONS[actionKey]
  const { errors } = form.formState

  return (
    <form
      id={RULE_FORM_ID}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="rule-action">Action</FieldLabel>
        <NativeSelect id="rule-action" {...form.register('actionKey')}>
          {[...BY_MODULE].map(([module, keys]) => (
            <optgroup key={module} label={MODULE_LABELS[module]}>
              {keys.map((key) => (
                <option key={key} value={key}>
                  {APPROVAL_ACTIONS[key].label}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        <FieldError>{errors.actionKey?.message}</FieldError>
      </div>

      {meta.hasAmount ? (
        <WhenField form={form} over={whenKind === 'over'} error={errors.amount?.message} />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-sm">When</span>
          <span className="text-sm">Any amount</span>
          <FieldDescription>
            {meta.label} has no amount, so the rule applies every time.
          </FieldDescription>
        </div>
      )}

      <Controller
        control={form.control}
        name="steps"
        render={({ field, fieldState }) => (
          <StepBuilder
            roles={roles.data?.items}
            module={meta.module}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message ?? null}
          />
        )}
      />

      <Controller
        control={form.control}
        name="companies"
        render={({ field, fieldState }) => (
          <EntityAccessField
            name="rule-companies"
            legend="Companies"
            value={field.value}
            onChange={field.onChange}
            entities={entities.data?.items}
            limits={null}
            error={fieldState.error?.message ?? null}
            hint="A company's own rules replace the all-company ones for that company."
          />
        )}
      />

      <div className="flex flex-col gap-2 rounded-[10px] bg-muted/50 px-3.5 py-3">
        <label htmlFor="rule-requester" className="flex items-center gap-3 text-[13px]">
          <Checkbox id="rule-requester" checked disabled />
          {APPROVAL_COPY.requesterCantApprove}
          <LockIcon aria-hidden className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </label>
        {meta.extraCondition && (
          <p className="pl-[30px] text-muted-foreground text-xs">
            Also: {meta.extraCondition.charAt(0).toLowerCase()}
            {meta.extraCondition.slice(1)}.
          </p>
        )}
      </div>
    </form>
  )
}

function WhenField({
  form,
  over,
  error,
}: {
  form: UseFormReturn<RuleValues>
  over: boolean
  error: string | undefined
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-semibold text-sm">When</legend>
      <Controller
        control={form.control}
        name="whenKind"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-1">
            {(['any', 'over'] as const).map((kind) => (
              <label
                key={kind}
                htmlFor={`rule-when-${kind}`}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted max-md:min-h-11"
              >
                <RadioGroupItem id={`rule-when-${kind}`} value={kind} />
                {kind === 'any' ? 'Any amount' : 'Over an amount'}
              </label>
            ))}
          </RadioGroup>
        )}
      />
      {over && (
        <div className="relative ml-7 max-w-60">
          <span
            aria-hidden
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground text-sm"
          >
            ₦
          </span>
          <Input
            aria-label="Amount in naira"
            inputMode="decimal"
            autoComplete="off"
            placeholder="5,000,000"
            aria-invalid={error ? true : undefined}
            className="pl-7 tabular-nums"
            {...form.register('amount')}
          />
        </div>
      )}
      <FieldError className="ml-7">{error}</FieldError>
    </fieldset>
  )
}
