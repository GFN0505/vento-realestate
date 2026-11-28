import { Link } from '@tanstack/react-router'
import type { ParcelRow } from '@vento/shared'
import { ChevronRightIcon } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { currentStageLine, hectaresText, parcelBadge, placeName } from './land-words'

/**
 * Phones (board LandTitleMobile): one card per parcel. Name; reference · place · size with the
 * status badge; then where the title stands. A tap opens the parcel (preloaded on touch).
 */
export function ParcelsCards({ rows }: { rows: readonly ParcelRow[] }) {
  return (
    <ul aria-label="Parcels" className="flex flex-col gap-2">
      {rows.map((parcel) => {
        const badge = parcelBadge(parcel)
        return (
          <li key={parcel.id}>
            <Link
              to="/land/$parcelId"
              params={{ parcelId: parcel.id }}
              preload="intent"
              data-parcel-row={parcel.id}
              className="flex min-h-[76px] w-full items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 text-left outline-hidden transition-colors active:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold text-[14px]">{parcel.name}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground text-xs tabular-nums">
                    {parcel.reference} · {placeName(parcel)} · {hectaresText(parcel.sizeSqm)}
                  </span>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {currentStageLine(parcel)}
                </span>
              </span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
