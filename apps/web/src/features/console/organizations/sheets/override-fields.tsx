import { FEATURE_KEYS, featureLabel } from '@vento/shared'
import { useId } from 'react'
import { NativeSelect } from '@/components/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ChoiceList } from '../../changes/choice-list'
import { NairaField } from '../../changes/naira-field'
import { LIMIT_LABEL, SHOWN_LIMITS } from '../../words'
import type { OverrideDraft, OverrideErrors } from './override-draft'

type Props = {
  draft: OverrideDraft
  errors: OverrideErrors
  set: (patch: Partial<OverrideDraft>) => void
  ids: { target: string; value: string; until: string }
}

/** Kind, what, value and until (spec "Add override"); Plan kinds can also set a limit. */
export function OverrideFields({ draft, errors, set, ids }: Props) {
  const isLimit = draft.target.startsWith('limit:')
  const isBudget = draft.target === 'limit:ai_budget'
  const unlimitedId = useId()
  return (
    <>
      <ChoiceList
        legend="Kind"
        columns={2}
        value={draft.kind}
        onChange={(kind) =>
          set({ kind, target: kind === 'release' && isLimit ? '' : draft.target })
        }
        choices={[
          {
            value: 'release',
            label: 'Release',
            note: 'Makes a feature available before its stage does',
          },
          { value: 'plan', label: 'Plan', note: 'A feature or a limit, beyond the plan' },
        ]}
      />
      <Field data-invalid={!!errors.target}>
        <FieldLabel htmlFor={ids.target}>
          {draft.kind === 'release' ? 'Feature' : 'Feature or limit'}
        </FieldLabel>
        <NativeSelect
          id={ids.target}
          value={draft.target}
          onChange={(event) => set({ target: event.target.value })}
          aria-invalid={!!errors.target}
          aria-describedby={errors.target ? `${ids.target}-error` : undefined}
        >
          <option value="">Choose…</option>
          {draft.kind === 'plan' && (
            <optgroup label="Limits">
              {SHOWN_LIMITS.map((key) => (
                <option key={key} value={`limit:${key}`}>
                  {LIMIT_LABEL[key]} limit
                </option>
              ))}
              <option value="limit:ai_budget">AI budget</option>
            </optgroup>
          )}
          <optgroup label="Features">
            {FEATURE_KEYS.map((key) => (
              <option key={key} value={key}>
                {featureLabel(key)}
              </option>
            ))}
          </optgroup>
        </NativeSelect>
        <FieldError id={`${ids.target}-error`} role="alert">
          {errors.target}
        </FieldError>
      </Field>
      {draft.target !== '' && !isLimit && (
        <ChoiceList
          legend="Value"
          columns={2}
          value={draft.on ? 'on' : 'off'}
          onChange={(value) => set({ on: value === 'on' })}
          choices={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      )}
      {isLimit && (
        <div className="flex flex-col gap-2.5">
          {isBudget ? (
            <NairaField
              id={ids.value}
              label="Monthly AI budget"
              value={draft.amount}
              onChange={(amount) => set({ amount })}
              error={errors.value ?? null}
              disabled={draft.unlimited}
            />
          ) : (
            <Field data-invalid={!!errors.value} className="max-w-40">
              <FieldLabel htmlFor={ids.value}>Limit</FieldLabel>
              <Input
                id={ids.value}
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.amount}
                disabled={draft.unlimited}
                onChange={(event) => set({ amount: event.target.value })}
                aria-invalid={!!errors.value}
                aria-describedby={errors.value ? `${ids.value}-error` : undefined}
              />
              <FieldError id={`${ids.value}-error`} role="alert">
                {errors.value}
              </FieldError>
            </Field>
          )}
          <label
            htmlFor={unlimitedId}
            className="flex min-h-11 items-center gap-2.5 text-sm md:min-h-0"
          >
            <Checkbox
              id={unlimitedId}
              checked={draft.unlimited}
              onCheckedChange={(checked) => set({ unlimited: checked === true })}
            />
            Unlimited
          </label>
        </div>
      )}
      <Field data-invalid={!!errors.until} className="max-w-60">
        <FieldLabel htmlFor={ids.until}>Until</FieldLabel>
        <Input
          id={ids.until}
          type="date"
          value={draft.until}
          onChange={(event) => set({ until: event.target.value })}
          aria-invalid={!!errors.until}
          aria-describedby={errors.until ? `${ids.until}-error` : `${ids.until}-help`}
        />
        <FieldError id={`${ids.until}-error`} role="alert">
          {errors.until}
        </FieldError>
        <FieldDescription id={`${ids.until}-help`}>
          The last day it applies. Leave empty for no end date.
        </FieldDescription>
      </Field>
    </>
  )
}
