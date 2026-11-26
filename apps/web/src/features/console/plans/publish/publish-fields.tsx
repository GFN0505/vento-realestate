import { featureLabel } from '@vento/shared'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { NairaField } from '../../changes/naira-field'
import { LIMIT_LABEL, moduleLabel } from '../../words'
import { featureModule } from '../plan-version-card'
import { PLAN_FEATURES, type PublishDraft, type PublishErrors } from './publish-draft'
import { LimitField, TextField } from './publish-inputs'

type Props = {
  draft: PublishDraft
  errors: PublishErrors
  isNew: boolean
  set: (patch: Partial<PublishDraft>) => void
  /** Ids per field, so Review can focus the first problem. */
  ids: Record<
    'key' | 'name' | 'features' | 'entities' | 'members' | 'aiBudget' | 'sortOrder',
    string
  >
}

const GROUPS = (() => {
  const groups = new Map<string, typeof PLAN_FEATURES>()
  for (const key of PLAN_FEATURES) {
    const module = featureModule(key)
    groups.set(module, [...(groups.get(module) ?? []), key])
  }
  return [...groups]
})()

/** Step 1 of Publish: features by module, limits, and name/order/default under More options. */
export function PublishFields({ draft, errors, isNew, set, ids }: Props) {
  const [more, setMore] = useState(isNew)
  const toggle = (key: (typeof PLAN_FEATURES)[number], on: boolean) =>
    set({ features: on ? [...draft.features, key] : draft.features.filter((k) => k !== key) })
  return (
    <>
      {isNew && (
        <TextField
          id={ids.key}
          label="Key"
          value={draft.key}
          error={errors.key}
          help="Lower-case letters and _, like growth_plus. It can't change later."
          onChange={(key) => set({ key })}
        />
      )}
      <fieldset
        id={ids.features}
        tabIndex={-1}
        className="flex flex-col gap-3 outline-none"
        aria-describedby={errors.features ? `${ids.features}-error` : undefined}
      >
        <legend className="mb-1 font-medium text-sm">Features</legend>
        <p className="-mt-1 text-muted-foreground text-xs">
          Core features are in every plan and AI is an add-on, so neither is listed.
        </p>
        <FieldError id={`${ids.features}-error`} role="alert">
          {errors.features}
        </FieldError>
        {GROUPS.map(([module, keys]) => (
          <div key={module} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
            <p className="py-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
              {moduleLabel(module)}
            </p>
            {keys.map((key) => (
              <label
                key={key}
                htmlFor={`${ids.features}-${key}`}
                className="flex min-h-11 items-center gap-2.5 text-[13.5px] md:min-h-8"
              >
                <Checkbox
                  id={`${ids.features}-${key}`}
                  checked={draft.features.includes(key)}
                  onCheckedChange={(c) => toggle(key, c === true)}
                />
                {featureLabel(key)}
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-medium text-sm">Limits</legend>
        <LimitField
          id={ids.entities}
          label={LIMIT_LABEL.entities}
          value={draft.entities}
          error={errors.entities}
          onChange={(entities) => set({ entities })}
        />
        <LimitField
          id={ids.members}
          label={LIMIT_LABEL.members}
          value={draft.members}
          error={errors.members}
          onChange={(members) => set({ members })}
        />
        <NairaField
          id={ids.aiBudget}
          label="AI budget base, a month"
          value={draft.aiBudget}
          error={errors.aiBudget ?? null}
          onChange={(aiBudget) => set({ aiBudget })}
          help="Where the AI add-on's budget starts."
        />
      </fieldset>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
          className="inline-flex min-h-8 items-center gap-1 self-start rounded-sm font-semibold text-link text-xs outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
        >
          More options
          <ChevronDownIcon aria-hidden className={more ? 'size-3.5 rotate-180' : 'size-3.5'} />
        </button>
        {more && (
          <>
            <TextField
              id={ids.name}
              label="Name"
              value={draft.name}
              error={errors.name}
              onChange={(name) => set({ name })}
            />
            <TextField
              id={ids.sortOrder}
              label="Sort order"
              value={draft.sortOrder}
              error={errors.sortOrder}
              inputMode="numeric"
              help="Lower comes first; also decides the next plan up for trials."
              onChange={(sortOrder) => set({ sortOrder })}
            />
            <label
              htmlFor={`${ids.sortOrder}-default`}
              className="flex min-h-11 items-center justify-between gap-3 text-sm"
            >
              Default for new organizations
              <Switch
                id={`${ids.sortOrder}-default`}
                checked={draft.defaultForNew}
                onCheckedChange={(defaultForNew) => set({ defaultForNew })}
              />
            </label>
          </>
        )}
      </div>
    </>
  )
}
