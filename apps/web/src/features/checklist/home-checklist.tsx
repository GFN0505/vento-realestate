import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { checklistQuery } from './checklist-queries'

// The card's code loads only for people who see it; Home's first load carries just this.
const SetupChecklist = lazy(() =>
  import('./setup-checklist').then((m) => ({ default: m.SetupChecklist })),
)

/** Home's slot for Finish setting up: the card once the checklist says it's shown. */
export function HomeChecklist() {
  const { data } = useQuery(checklistQuery())
  if (!data?.shown || data.items.length === 0) return null
  return (
    <Suspense fallback={<ChecklistSkeleton />}>
      <SetupChecklist />
    </Suspense>
  )
}

/** The card's shape while its code arrives: header, bar, one row (two on phones). */
function ChecklistSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-3 rounded-[12px] border bg-card px-4 pt-4 pb-2 sm:px-5"
    >
      <div className="flex h-8 items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
        {[0, 1].map((i) => (
          <div key={i} className="flex min-h-[60px] items-center gap-3 border-t py-2.5">
            <Skeleton className="size-5 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
