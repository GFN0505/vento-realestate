import { useQuery } from '@tanstack/react-query'
import { AUDIT_MODULE_LABELS, AUDIT_MODULES, type AuditModule } from '@vento/shared'
import { SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { NativeSelect } from '@/components/native-select'
import { SearchField } from '@/components/search-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { cn } from '@/lib/utils'
import { addDays, auditRange, lagosToday, rangeProblem } from './audit-range'
import type { AuditSearch } from './audit-search'
import { PersonFilter } from './person-filter'

type Props = {
  search: AuditSearch
  update: (patch: Partial<AuditSearch>, options?: { replace?: boolean }) => void
  /** Phones: Export sits beside search instead of under the title. */
  exportAction: ReactNode
}

/** How many filters narrow the log (search aside), for the phone's Filters button. */
export function activeFilters(search: AuditSearch): number {
  return [
    search.module,
    search.person,
    search.company,
    search.from || search.to,
    search.target,
  ].filter(Boolean).length
}

const on = 'border-selected-border bg-selected text-selected-foreground'

const PRESETS = [7, 30, 90, 365] as const
const PRESET_LABELS: Record<(typeof PRESETS)[number], string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
  365: 'Last 12 months',
}

/** Which preset the address shows, or 'custom'. */
export function presetOf(search: AuditSearch, today = lagosToday()): string {
  const { from, to } = auditRange(search)
  if (to !== today) return 'custom'
  return String(PRESETS.find((days) => addDays(today, -(days - 1)) === from) ?? 'custom')
}

const select = 'h-11 md:h-10 md:text-[13px]'

/**
 * Search · Module · Person · Company · Dates (board AuditLog), every one held in the address so a
 * filtered view can be shared. Search waits 300 ms after typing stops.
 */
export function AuditToolbar({ search, update, exportAction }: Props) {
  // Companies for the filter: the cached list the rest of Settings uses.
  const companies = useQuery(entitiesQuery())
  const preset = presetOf(search)
  const [custom, setCustom] = useState(preset === 'custom')
  const range = auditRange(search)
  const problem = rangeProblem(range)
  const set = (patch: Partial<AuditSearch>) =>
    update({ ...patch, page: undefined, open: undefined })
  const count = activeFilters(search)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const clear = () => {
    setCustom(false)
    set({
      module: undefined,
      person: undefined,
      company: undefined,
      from: undefined,
      to: undefined,
      target: undefined,
      targetId: undefined,
      about: undefined,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          id="audit-search"
          value={search.q}
          onSearch={(q) => update({ q, page: undefined }, { replace: true })}
          label="Search the audit log"
          placeholder="Search: a person, record or value"
          className="min-w-0 flex-1 md:w-72 md:flex-none"
        />
        {/* Phones: the filters fold behind one button with how many are on. */}
        <Button
          variant="outline"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-controls="audit-filters"
          className={cn('h-11 md:hidden', count > 0 && on)}
        >
          <SlidersHorizontalIcon aria-hidden />
          Filters{count > 0 && ` · ${count}`}
        </Button>
        <div className="md:hidden">{exportAction}</div>
        <div
          id="audit-filters"
          className={cn(
            'grid w-full grid-cols-2 gap-2 md:contents',
            !filtersOpen && 'max-md:hidden',
          )}
        >
          <NativeSelect
            aria-label="Module"
            value={search.module ?? ''}
            className={cn(select, search.module && on)}
            onChange={(e) =>
              set({ module: (e.target.value || undefined) as AuditModule | undefined })
            }
          >
            <option value="">All modules</option>
            {AUDIT_MODULES.map((m) => (
              <option key={m} value={m}>
                {AUDIT_MODULE_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
          <PersonFilter
            value={search.person}
            onChange={(person) => set({ person })}
            range={range}
            disabled={problem !== null}
            className={search.person ? on : undefined}
          />
          <NativeSelect
            aria-label="Company"
            value={search.company ?? ''}
            onChange={(e) => set({ company: e.target.value || undefined })}
            className={cn(select, search.company && on)}
          >
            <option value="">All companies</option>
            {companies.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Dates"
            value={custom ? 'custom' : preset}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'custom') return setCustom(true)
              setCustom(false)
              const days = Number(value)
              // The default range keeps the address bare.
              set({
                from: days === 7 ? undefined : addDays(lagosToday(), -(days - 1)),
                to: undefined,
              })
            }}
            className={cn(select, (search.from || search.to) && on)}
          >
            {PRESETS.map((days) => (
              <option key={days} value={days}>
                {PRESET_LABELS[days]}
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </NativeSelect>
          {count > 0 && (
            <Button variant="ghost" onClick={clear} className="h-11 md:h-10">
              Clear filters
            </Button>
          )}
        </div>
      </div>
      {custom && (
        <div className="flex flex-wrap items-end gap-2">
          <DateInput label="From" value={range.from} onChange={(from) => set({ from })} />
          <DateInput
            label="To"
            value={range.to}
            max={lagosToday()}
            onChange={(to) => set({ to })}
          />
          <p role={problem ? 'alert' : undefined} className="pb-2.5 text-[13px] text-destructive">
            {problem}
          </p>
        </div>
      )}
      {search.target && (
        <p className="flex items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-selected-border bg-selected py-0.5 pr-1 pl-3 font-semibold text-selected-foreground">
            History of {search.about ?? `this ${search.target}`}
            <button
              type="button"
              aria-label="Show every entry"
              onClick={() => set({ target: undefined, targetId: undefined, about: undefined })}
              className="inline-flex size-6 items-center justify-center rounded-full outline-hidden hover:bg-card focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:size-11"
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          </span>
        </p>
      )}
    </div>
  )
}

function DateInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: string
  max?: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold text-muted-foreground text-xs">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        value={value}
        max={max}
        required
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-40 tabular-nums"
      />
    </div>
  )
}
