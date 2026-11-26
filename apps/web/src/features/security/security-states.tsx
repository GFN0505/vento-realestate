import { CloudOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** One card that couldn't load; the rest of the page keeps working (spec). */
export function CardError({
  title,
  message,
  retrying,
  onRetry,
}: {
  title: string
  message: string
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <section aria-label={title} className="rounded-[12px] border bg-card px-5 py-5 sm:px-6">
      <h2 className="font-heading font-semibold text-base">{title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <CloudOffIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <p role="alert" className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {message}
        </p>
        <Button variant="outline" disabled={retrying} onClick={onRetry} className="max-sm:h-11">
          Try again
        </Button>
      </div>
    </section>
  )
}

/** A card in its final size while it loads, so nothing shifts when the data lands. */
export function CardSkeleton({ rows, header = false }: { rows: number; header?: boolean }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-[12px] border bg-card">
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3.5 sm:px-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          {header && <Skeleton className="h-3 w-56 max-w-full" />}
        </div>
        {header && <Skeleton className="h-10 w-32 max-sm:hidden" />}
      </div>
      <div className="flex flex-col divide-y border-t">
        {Array.from({ length: rows }, (_, i) => i).map((row) => (
          <div key={row} className="flex items-center gap-3.5 px-5 py-4 sm:px-6">
            <Skeleton className="size-9 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
            <Skeleton className="h-10 w-28 max-sm:hidden" />
          </div>
        ))}
      </div>
    </div>
  )
}
