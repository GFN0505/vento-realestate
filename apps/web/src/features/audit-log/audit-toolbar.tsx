import { useQuery } from '@tanstack/react-query'
import { AUDIT_MODULE_LABELS, AUDIT_MODULES, type AuditModule } from '@vento/shared'
import { XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { NativeSelect } from '@/components/native-select'
import { SearchField } from '@/components/search-field'
import { Input } from '@/components/ui/input'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { orpc } from '@/lib/orpc'
import { rangeProblem } from './audit-range'
import { type AuditSearch, addDays, auditRange, lagosToday } from './audit-search'

type Props = {
  search: AuditSearch
  update: (patch: Partial<AuditSearch>, options?: { replace?: boolean }) => void
}

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
export function AuditToolbar({ search, update }: Props) {
  // People and companies for the filters: cached lists the rest of Settings uses.
  const people = useQuery(
    orpc.team.list.queryOptions({
      input: { show: 'everyone', page: 1, pageSize: 100 },
      staleTime: 5 * 60_000,
    }),
  )
  const companies = useQuery(entitiesQuery())
  const preset = presetOf(search)
  const [custom, setCustom] = useState(preset === 'custom')
  const range = auditRange(search)
  const problem = rangeProblem(range)
  const set = (patch: Partial<AuditSearch>) =>
    update({ ...patch, page: undefined, open: undefined })

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <SearchField
          id="audit-search"
          value={search.q}
          onSearch={(q) => update({ q, page: undefined }, { replace: true })}
          label="Search the audit log"
          placeholder="Search: a person, record or value"
          className="col-span-2 md:w-72"
        />
        <NativeSelect
          aria-label="Module"
          value={search.module ?? ''}
          onChange={(e) =>
            set({ module: (e.target.value || undefined) as AuditModule | undefined })
          }
          className={select}
        >
          <option value="">All modules</option>
          {AUDIT_MODULES.map((m) => (
            <option key={m} value={m}>
              {AUDIT_MODULE_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Person"
          value={search.person ?? ''}
          onChange={(e) => set({ person: e.target.value || undefined })}
          className={select}
        >
          <option value="">Anyone</option>
          {people.data?.items.map((row) =>
            row.kind === 'member' ? (
              <option key={row.id} value={row.userId}>
                {row.name}
              </option>
            ) : null,
          )}
        </NativeSelect>
        <NativeSelect
          aria-label="Company"
          value={search.company ?? ''}
          onChange={(e) => set({ company: e.target.value || undefined })}
          className={select}
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
          className={select}
        >
          {PRESETS.map((days) => (
            <option key={days} value={days}>
              {PRESET_LABELS[days]}
            </option>
          ))}
          <option value="custom">Custom dates</option>
        </NativeSelect>
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
              className="inline-flex size-6 items-center justify-center rounded-full outline-hidden hover:bg-card focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:size-9"
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
