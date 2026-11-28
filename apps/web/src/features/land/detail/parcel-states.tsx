import { CloudOffIcon, MapPinOffIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isNotFound } from '@/lib/error-data'
import { LAND_COPY } from '../land-words'

/** Not found (another organization's or company's parcel), or a load that failed: Try again. */
export function ParcelLoadError({
  error,
  retrying,
  onRetry,
}: {
  error: unknown
  retrying: boolean
  onRetry: () => void
}) {
  if (isNotFound(error)) {
    return (
      <EmptyState icon={MapPinOffIcon}>
        <h1 className="mb-1 font-heading font-semibold text-[17px] text-foreground">
          Parcel not found
        </h1>
        {LAND_COPY.parcelNotFound}
      </EmptyState>
    )
  }
  return (
    <EmptyState
      icon={CloudOffIcon}
      action={
        <Button variant="outline" onClick={onRetry} disabled={retrying} className="max-md:h-11">
          Try again
        </Button>
      }
    >
      <h1 className="mb-1 font-heading font-semibold text-[17px] text-foreground">
        Parcel couldn't load
      </h1>
      <span role="alert">{LAND_COPY.parcelLoadError}</span>
    </EmptyState>
  )
}

/** The page's final layout in grey: header, tracker, documents and activity. */
export function ParcelSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-4 rounded-[10px] border bg-card p-4 sm:px-6 sm:py-5">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-col gap-4 md:flex-row">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 gap-3 md:flex-col">
              <Skeleton className="size-[30px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="flex flex-col gap-3 rounded-[10px] border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-3 rounded-[10px] border bg-card p-5 lg:flex">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
    </div>
  )
}
