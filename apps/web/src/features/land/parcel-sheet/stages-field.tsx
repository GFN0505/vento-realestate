import { stateLabel, TITLE_STAGE_TYPES, type TitleStageType } from '@vento/shared'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import { StatusBadge } from '@/components/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field'
import { stageLabel } from '@/features/land/land-words'
import { cn } from '@/lib/utils'
import type { StagePreview } from './parcel-stages'
import type { ParcelForm } from './parcel-values'

type Props = { form: ParcelForm; preview: readonly StagePreview[] }

/**
 * Title stages for a new parcel: the state's usual ones (FCT: R of O), each "Granted" once its
 * document is among the files above. **Edit stages** sets them to how the land was titled.
 */
export function StagesField({ form, preview }: Props) {
  const [editing, setEditing] = useState(false)
  const state = useWatch({ control: form.control, name: 'state' })
  const error = form.formState.errors.stages?.message
  const picked = new Set(preview.map((s) => s.type))
  const required = new Set(preview.filter((s) => s.required).map((s) => s.type))

  function toggle(type: TitleStageType, on: boolean) {
    const next = TITLE_STAGE_TYPES.filter((t) => (t === type ? on : picked.has(t)))
    form.setValue('stages', next, { shouldDirty: true, shouldValidate: true })
  }

  return (
    <section aria-labelledby="parcel-stages" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="parcel-stages" className="font-semibold text-sm">
          Title stages
        </h3>
        <button
          type="button"
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
          className="rounded-sm font-semibold text-[13px] text-link outline-hidden hover:text-link-hover focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
        >
          {editing ? 'Done' : 'Edit stages'}
        </button>
      </div>
      {editing ? (
        <fieldset aria-label="Title stages" className="flex flex-col rounded-[10px] border">
          {TITLE_STAGE_TYPES.map((type) => {
            const locked = required.has(type)
            const id = `stage-${type}`
            return (
              <label
                key={type}
                htmlFor={id}
                className={cn(
                  'flex min-h-11 items-center gap-3 border-b px-3.5 text-sm last:border-b-0',
                  locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50',
                )}
              >
                <Checkbox
                  id={id}
                  checked={picked.has(type)}
                  disabled={locked}
                  onCheckedChange={(on) => toggle(type, on === true)}
                />
                <span className="flex-1">{stageLabel(type)}</span>
                {locked && (
                  <span className="text-muted-foreground text-xs">Its document is above</span>
                )}
              </label>
            )
          })}
        </fieldset>
      ) : preview.length === 0 ? (
        <p className="text-muted-foreground text-sm">Choose a state to see the usual stages.</p>
      ) : (
        <ol aria-labelledby="parcel-stages" className="flex flex-col rounded-[10px] border">
          {preview.map((stage, i) => (
            <li
              key={stage.type}
              className="flex min-h-11 items-center gap-3 border-b px-3.5 text-sm last:border-b-0"
            >
              <span className="w-4 text-muted-foreground text-xs tabular-nums">{i + 1}</span>
              <span className="flex-1">{stageLabel(stage.type)}</span>
              <StatusBadge tone={stage.granted ? 'emerald' : 'slate'}>
                {stage.granted ? 'Granted' : 'Not started'}
              </StatusBadge>
            </li>
          ))}
        </ol>
      )}
      <FieldError>{error}</FieldError>
      {!editing && state && form.getValues('stages') === null && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          The usual stages in {stateLabel(state)}. Land bought with a C of O usually adds a deed of
          assignment and governor's consent.
        </p>
      )}
    </section>
  )
}
