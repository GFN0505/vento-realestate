import { Link, useNavigate } from '@tanstack/react-router'
import type { ParcelRow } from '@vento/shared'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { cn } from '@/lib/utils'
import { currentStageLine, hectaresText, lgaLine, parcelBadge, placeName } from './land-words'
import type { ParcelsSearch, ParcelsSort } from './parcels-search'
import { StageBar } from './stage-bar'

const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5 last:pr-5'
const td = 'h-[60px] px-3 align-middle first:pl-5 last:pr-5'
const INTERACTIVE = 'button, a, input'

type Props = {
  rows: readonly ParcelRow[]
  search: ParcelsSearch
  onSort: (column: ParcelsSort) => void
}

/**
 * Parcels (board LandTitle, with the spec's slice-1 columns). A plain table: 25 rows a page. The
 * whole row opens the parcel; its name is the link (preloaded on hover) and keyboard target.
 */
export function ParcelsTable({ rows, search, onSort }: Props) {
  const navigate = useNavigate()
  const sort = search.sort ?? 'name'
  const dir = search.dir ?? 'asc'
  const sortable = (column: ParcelsSort, label: string, align: 'left' | 'right' = 'left') => (
    <th
      scope="col"
      aria-sort={sort === column ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(th, align === 'right' && 'text-right')}
    >
      <SortButton
        label={label}
        active={sort === column}
        dir={dir}
        align={align}
        onClick={() => onSort(column)}
      />
    </th>
  )

  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Parcels</caption>
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[24%]" />
          <col className="w-[11%]" />
          <col className="w-[22%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            {sortable('name', 'Parcel')}
            <th scope="col" className={th}>
              Location
            </th>
            {sortable('size', 'Size', 'right')}
            <th scope="col" className={th}>
              Title stage
            </th>
            <th scope="col" className={th}>
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((parcel) => {
            const badge = parcelBadge(parcel)
            return (
              <tr
                key={parcel.id}
                onClick={(event) => {
                  const target = event.target as Element
                  if (target.closest(INTERACTIVE)) return
                  void navigate({ to: '/land/$parcelId', params: { parcelId: parcel.id } })
                }}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <td className={td}>
                  <div className="flex min-w-0 flex-col">
                    <Link
                      to="/land/$parcelId"
                      params={{ parcelId: parcel.id }}
                      preload="intent"
                      data-parcel-row={parcel.id}
                      title={parcel.name}
                      className="truncate rounded-sm font-semibold outline-hidden hover:underline hover:underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {parcel.name}
                    </Link>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {parcel.reference}
                    </span>
                  </div>
                </td>
                <td className={td}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate" title={placeName(parcel)}>
                      {placeName(parcel)}
                    </span>
                    <span
                      className="truncate text-muted-foreground text-xs"
                      title={lgaLine(parcel)}
                    >
                      {lgaLine(parcel)}
                    </span>
                  </div>
                </td>
                <td className={cn(td, 'text-right font-medium tabular-nums')}>
                  {hectaresText(parcel.sizeSqm)}
                </td>
                <td className={td}>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <StageBar parcel={parcel} />
                    <span className="truncate text-xs" title={currentStageLine(parcel)}>
                      {currentStageLine(parcel)}
                    </span>
                  </div>
                </td>
                <td className={td}>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SortButton({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  align: 'left' | 'right'
  onClick: () => void
}) {
  const Icon = dir === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm uppercase tracking-[0.04em] outline-hidden hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring',
        align === 'right' && 'flex-row-reverse',
        active && 'text-foreground',
      )}
    >
      {label}
      <Icon aria-hidden className={cn('size-3', !active && 'invisible')} />
    </button>
  )
}
