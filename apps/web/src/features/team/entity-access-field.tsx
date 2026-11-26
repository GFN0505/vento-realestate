import type { Entity } from '@vento/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'

export type EntityAccessValue = { mode: 'all' | 'some'; ids: readonly string[] }

type Props = {
  /** Stable prefix for ids (one field per sheet). */
  name: string
  value: EntityAccessValue
  onChange: (value: EntityAccessValue) => void
  /** Active entities the viewer can see (already limited by the server). */
  entities: readonly Pick<Entity, 'id' | 'name'>[] | undefined
  /** The granter's own limit; null = all entities. */
  limits: readonly string[] | null
  error?: string | null
  hint?: string
}

/**
 * Entity access for an invitation or a member (spec "Entity access"). An unlimited granter picks
 * All entities or Only some; a granter limited to some entities sees only theirs and never "All
 * entities"; a granter limited to one sees it as fixed text.
 */
export function EntityAccessField({ name, value, onChange, entities, limits, error, hint }: Props) {
  if (!entities) {
    return (
      <FieldSet>
        <FieldLegend className="text-foreground text-sm">Entity access</FieldLegend>
        <Skeleton className="h-16 w-full" />
      </FieldSet>
    )
  }
  const only = limits?.length === 1 ? entities.find((e) => e.id === limits[0]) : undefined
  if (only) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-sm">Entity access</span>
        <span className="text-sm">{only.name}</span>
      </div>
    )
  }

  const toggle = (id: string, on: boolean) =>
    onChange({ mode: 'some', ids: on ? [...value.ids, id] : value.ids.filter((x) => x !== id) })
  const list = (
    <ul aria-label="Entities" className="flex flex-col gap-0.5">
      {entities.map((entity) => (
        <li key={entity.id}>
          <label
            htmlFor={`${name}-${entity.id}`}
            className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted max-md:min-h-11"
          >
            <Checkbox
              id={`${name}-${entity.id}`}
              checked={value.ids.includes(entity.id)}
              onCheckedChange={(on) => toggle(entity.id, on === true)}
              aria-invalid={error ? true : undefined}
            />
            {entity.name}
          </label>
        </li>
      ))}
    </ul>
  )

  return (
    <FieldSet aria-describedby={error ? `${name}-error` : undefined}>
      <FieldLegend className="mb-0 text-foreground text-sm">Entity access</FieldLegend>
      {limits ? (
        list
      ) : (
        <RadioGroup
          value={value.mode}
          onValueChange={(mode) => onChange({ ...value, mode: mode as EntityAccessValue['mode'] })}
          className="gap-1"
        >
          {(['all', 'some'] as const).map((mode) => (
            <label
              key={mode}
              htmlFor={`${name}-${mode}`}
              className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted max-md:min-h-11"
            >
              <RadioGroupItem id={`${name}-${mode}`} value={mode} />
              {mode === 'all' ? 'All entities' : 'Only some entities'}
            </label>
          ))}
          {value.mode === 'some' && <div className="ml-7 border-l pl-2">{list}</div>}
        </RadioGroup>
      )}
      <FieldError id={`${name}-error`}>{error}</FieldError>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </FieldSet>
  )
}

/** What the API takes: null = all entities. */
export function entityIdsOf(value: EntityAccessValue): string[] | null {
  return value.mode === 'all' ? null : [...value.ids]
}
