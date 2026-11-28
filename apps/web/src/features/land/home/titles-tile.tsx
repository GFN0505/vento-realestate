import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { LandHome } from '@vento/shared'
import type { ReactNode } from 'react'
import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { landHomeQuery } from '@/features/land/parcels-queries'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { LAND_HOME_COPY, stalledLine } from './land-home-words'
import { useHomeEntityId } from './use-home-entity'

const link =
  'relative z-10 rounded-sm font-semibold text-link outline-hidden underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring'

/** Segment shades for the per-company bar, in the bar's order; the legend names each. */
const SHADES = ['bg-brand', 'bg-brand/60', 'bg-brand/35', 'bg-status-slate'] as const

type Props = { label: string; icon: ReactNode }

/**
 * Titles in progress (spec "Role homes", tile 2): parcels with a stage under way, how many have
 * stalled, and under *All companies* a bar per company. Opens the list filtered to them.
 */
export function TitlesInProgressTile({ label, icon }: Props) {
  const entityId = useHomeEntityId()
  const home = useQuery(landHomeQuery(entityId))
  const canAdd = can(useEffectiveAccess().permissions, 'land', 'create')
  const data = home.data

  if (!data) {
    return (
      <StatCard
        label={label}
        icon={icon}
        value={home.isError ? undefined : <Skeleton className="inline-block h-[0.8em] w-10" />}
        detail={
          home.isError ? (
            <button
              type="button"
              onClick={() => void home.refetch()}
              disabled={home.isFetching}
              className={cn(link, 'max-md:py-2')}
            >
              Couldn't load. Try again
            </button>
          ) : (
            <Skeleton className="h-3 w-32" />
          )
        }
      />
    )
  }

  if (!data.hasParcels) {
    return (
      <StatCard
        label={label}
        icon={icon}
        value="0"
        detail={
          canAdd ? (
            <Link to="/land" search={{ sheet: 'add' }} className={cn(link, 'max-md:py-2')}>
              {LAND_HOME_COPY.firstParcel}
            </Link>
          ) : (
            LAND_HOME_COPY.noParcels
          )
        }
      />
    )
  }

  const { count, stalled, byEntity } = data.titlesInProgress
  const showBar = !entityId && byEntity.length > 1
  return (
    <Link
      to="/land"
      search={{ filter: 'in_progress' }}
      preload="intent"
      className="group flex rounded-xl outline-hidden transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <StatCard
        label={label}
        icon={icon}
        value={
          <>
            {count}
            <span className="sr-only">.</span>
          </>
        }
        detail={
          <span className={stalled > 0 ? 'font-medium text-status-rose-fg' : undefined}>
            {stalledLine(stalled)}
          </span>
        }
        chart={showBar ? <CompanyBar rows={byEntity} /> : undefined}
        className="w-full group-hover:border-input-hover"
      />
    </Link>
  )
}

/** The bar's segments: the three largest companies, then the rest as one. */
function segments(rows: LandHome['titlesInProgress']['byEntity']) {
  const top = rows.slice(0, 3).map((r) => ({ key: r.entityId, name: r.name, count: r.count }))
  const rest = rows.slice(3)
  if (rest.length === 0) return top
  const others = rest.reduce((n, r) => n + r.count, 0)
  return [...top, { key: 'others', name: `${rest.length} more`, count: others }]
}

/**
 * Under *All companies*: each company's share, and a legend naming every segment in the same
 * order and shade (the bar itself is decoration; the legend is what's read).
 */
function CompanyBar({ rows }: { rows: LandHome['titlesInProgress']['byEntity'] }) {
  const parts = segments(rows)
  const total = parts.reduce((n, r) => n + r.count, 0)
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {parts.map((r, i) => (
          <span
            key={r.key}
            className={cn('h-full', SHADES[i])}
            style={{ width: `${(r.count / total) * 100}%` }}
          />
        ))}
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        {parts.map((r, i) => (
          <span key={r.key} className="flex min-w-0 max-w-full items-center gap-1">
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', SHADES[i])} />
            <span className="min-w-0 truncate">{r.name}</span>
            <span className="shrink-0 font-medium text-foreground">{r.count}</span>
          </span>
        ))}
      </span>
    </div>
  )
}
