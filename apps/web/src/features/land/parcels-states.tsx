import { CloudOffIcon, MapPinnedIcon, PlusIcon, SearchXIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LAND_COPY } from './land-words'
import { preloadParcelSheet } from './parcel-sheet-lazy'

/** Loading, in the final layout: table rows on desktop, cards on phones. */
export function ParcelsSkeleton({ phone }: { phone: boolean }) {
  const rows = [0, 1, 2, 3, 4]
  if (phone) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {rows.map((i) => (
          <div
            key={i}
            className="flex h-[92px] flex-col justify-center gap-2 rounded-[14px] border bg-card px-3.5"
          >
            <Skeleton className="h-3.5 w-44" />
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden className="overflow-hidden rounded-[10px] border bg-card">
      <div className="h-10 border-b bg-muted/40" />
      {rows.map((i) => (
        <div key={i} className="flex h-[60px] items-center gap-3 border-b px-5 last:border-b-0">
          <div className="flex w-[28%] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="flex w-[24%] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="ml-auto h-3.5 w-14" />
          <div className="ml-[4%] flex w-[22%] flex-col gap-1.5">
            <Skeleton className="h-1 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function AddParcelButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      onPointerEnter={preloadParcelSheet}
      onFocus={preloadParcelSheet}
      onClick={onClick}
      aria-keyshortcuts="n"
      className={cn('max-md:h-11', className)}
    >
      <PlusIcon aria-hidden />
      {LAND_COPY.addParcel}
    </Button>
  )
}

type EmptyProps = {
  filtered: boolean
  /** Only the Archived chip is on: its own empty state. */
  archivedOnly: boolean
  /** The switcher's company, when one is picked. */
  companyName: string | null
  onClear: () => void
  onAllCompanies: () => void
  /** Add parcel, when the viewer may. */
  onAdd: (() => void) | null
}

/** No rows: filters matched nothing, the company has none, or there are none at all. */
export function ParcelsEmpty({
  filtered,
  archivedOnly,
  companyName,
  onClear,
  onAllCompanies,
  onAdd,
}: EmptyProps) {
  if (archivedOnly) {
    return (
      <EmptyState
        icon={MapPinnedIcon}
        action={
          <Button variant="outline" onClick={onClear} className="max-md:h-11">
            Show all parcels
          </Button>
        }
      >
        No archived parcels.
      </EmptyState>
    )
  }
  if (filtered) {
    return (
      <EmptyState
        icon={SearchXIcon}
        action={
          <Button variant="outline" onClick={onClear} className="max-md:h-11">
            {LAND_COPY.clearFilters}
          </Button>
        }
      >
        {LAND_COPY.filteredEmpty}
      </EmptyState>
    )
  }
  if (companyName) {
    return (
      <EmptyState
        icon={MapPinnedIcon}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {onAdd && <AddParcelButton onClick={onAdd} />}
            <Button variant="outline" onClick={onAllCompanies} className="max-md:h-11">
              Show all companies
            </Button>
          </div>
        }
      >
        No parcels in {companyName} yet.
      </EmptyState>
    )
  }
  return (
    <EmptyState icon={MapPinnedIcon} action={onAdd && <AddParcelButton onClick={onAdd} />}>
      {LAND_COPY.empty}
    </EmptyState>
  )
}

export function ParcelsError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <EmptyState
      icon={CloudOffIcon}
      action={
        <Button variant="outline" onClick={onRetry} disabled={retrying} className="max-md:h-11">
          Try again
        </Button>
      }
    >
      <span role="alert">{LAND_COPY.loadError}</span>
    </EmptyState>
  )
}
