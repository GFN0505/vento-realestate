import type { Entity } from '@vento/shared'
import { useState } from 'react'
import { EntityAccessField, type EntityAccessValue } from '../entity-access-field'

type Props = {
  value: EntityAccessValue
  onChange: (value: EntityAccessValue) => void
  entities: readonly Pick<Entity, 'id' | 'name'>[] | undefined
  limits: readonly string[] | null
  error: string | null
}

const HINT = 'Invite people who need different access in separate batches.'

/**
 * Entity access, quiet by default: nothing with a single entity, else one line "Access: All
 * entities · Change" that opens the choice. It opens by itself when there's a problem.
 */
export function AccessLine({ value, onChange, entities, limits, error }: Props) {
  const [open, setOpen] = useState(false)
  if (!entities) return null
  const choices = limits ? entities.filter((e) => limits.includes(e.id)) : entities
  if (choices.length <= 1 && !limits) return null

  if (open || error) {
    return (
      <EntityAccessField
        name="invite-entities"
        value={value}
        onChange={onChange}
        entities={entities}
        limits={limits}
        error={error}
        hint={value.mode === 'some' ? HINT : undefined}
      />
    )
  }
  const chosen = choices.filter((e) => value.ids.includes(e.id))
  const label =
    value.mode === 'all'
      ? 'All companies'
      : chosen.length === 1
        ? (chosen[0]?.name ?? '')
        : `${chosen.length} companies`
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <span className="text-muted-foreground">Access:</span>
      <span className="truncate font-medium" title={label}>
        {label}
      </span>
      {choices.length > 1 && (
        <>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Change company access, now ${label}`}
            className="rounded-sm font-semibold text-link underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
          >
            Change
          </button>
        </>
      )}
    </p>
  )
}
