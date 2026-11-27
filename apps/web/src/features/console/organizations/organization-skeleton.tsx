import { Skeleton } from '@/components/ui/skeleton'

const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

function CardSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[10px] border bg-card ${className ?? ''}`}>
      <div className="flex h-[52px] items-center border-b px-4 sm:px-[18px]">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-[18px]">
        {ROWS.slice(0, rows).map((row) => (
          <Skeleton key={row} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}

/** Organization detail loading, in its final layout: header, three cards, then Features. */
export function OrganizationSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={1} className="max-lg:hidden" />
        <CardSkeleton rows={2} className="max-lg:hidden" />
      </div>
      <CardSkeleton rows={8} />
    </div>
  )
}
