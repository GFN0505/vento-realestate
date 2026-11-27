import { Skeleton } from '@/components/ui/skeleton'

const NUMBERS = ['a', 'b', 'c', 'd'] as const
const ROWS = ['a', 'b', 'c', 'd'] as const

/** Loading, in the final layout: header, four numbers, the queue, two panels. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {NUMBERS.map((n) => (
          <Skeleton key={n} className="h-[92px] rounded-[10px]" />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-[10px] border bg-card p-4">
        <Skeleton className="h-4 w-32" />
        {ROWS.map((r) => (
          <Skeleton key={r} className="h-5 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-[10px]" />
        <Skeleton className="h-64 rounded-[10px]" />
      </div>
    </div>
  )
}
