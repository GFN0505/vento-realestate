import { Skeleton } from '@/components/ui/skeleton'

/** A page loading inside the shell: header and a content block in the final layout. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-56 w-full rounded-[10px]" />
    </div>
  )
}
