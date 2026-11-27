import { useQuery } from '@tanstack/react-query'
import { FEATURE_KEYS, featureLabel } from '@vento/shared'
import { XIcon } from 'lucide-react'
import { useId } from 'react'
import { NativeSelect } from '@/components/native-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACTIVITY_KINDS, type ActivitySearch } from '@/routes/console/-search'
import { activityPeopleQuery } from './queries'

const KIND_LABEL: Record<(typeof ACTIVITY_KINDS)[number], string> = {
  release: 'Releases',
  plan: 'Plans',
  trial: 'Trials',
  add_on: 'Add-ons',
  override: 'Overrides',
  super_admin: 'Super-admins',
}

type Props = {
  search: ActivitySearch
  update: (patch: Partial<ActivitySearch>) => void
  /** The organization filter's name (it arrives from a detail page's **See all**). */
  organizationName: string | null
}

const filterLabel = 'font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]'

/** Person, feature, kind and dates (spec), all in the address; organization comes from a link. */
export function ActivityFilters({ search, update, organizationName }: Props) {
  const people = useQuery(activityPeopleQuery()).data ?? []
  const ids = { person: useId(), feature: useId(), kind: useId(), from: useId(), to: useId() }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.person} className={filterLabel}>
            Person
          </Label>
          <NativeSelect
            id={ids.person}
            value={search.person ?? ''}
            onChange={(e) => update({ person: e.target.value || undefined })}
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.feature} className={filterLabel}>
            Feature
          </Label>
          <NativeSelect
            id={ids.feature}
            value={search.feature ?? ''}
            onChange={(e) => update({ feature: e.target.value || undefined })}
          >
            <option value="">Any feature</option>
            {FEATURE_KEYS.map((key) => (
              <option key={key} value={key}>
                {featureLabel(key)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.kind} className={filterLabel}>
            Kind
          </Label>
          <NativeSelect
            id={ids.kind}
            value={search.kind ?? ''}
            onChange={(e) => update({ kind: ACTIVITY_KINDS.find((k) => k === e.target.value) })}
          >
            <option value="">Any change</option>
            {ACTIVITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.from} className={filterLabel}>
            From
          </Label>
          <Input
            id={ids.from}
            type="date"
            value={search.from ?? ''}
            max={search.to}
            onChange={(e) => update({ from: e.target.value || undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.to} className={filterLabel}>
            To
          </Label>
          <Input
            id={ids.to}
            type="date"
            value={search.to ?? ''}
            min={search.from}
            onChange={(e) => update({ to: e.target.value || undefined })}
          />
        </div>
      </div>
      {search.organization && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          Changes to{' '}
          <span className="font-medium text-foreground">
            {organizationName ?? 'one organization'}
          </span>
          <button
            type="button"
            onClick={() => update({ organization: undefined })}
            className="inline-flex min-h-8 items-center gap-1 rounded-sm font-semibold text-link outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
          >
            <XIcon aria-hidden className="size-3.5" />
            Show all organizations
          </button>
        </p>
      )}
    </div>
  )
}
