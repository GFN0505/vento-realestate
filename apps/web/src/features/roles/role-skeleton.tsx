import { PERMISSION_MODULES } from '@vento/shared'
import { Skeleton } from '@/components/ui/skeleton'

/** The role page in its final layout while the role loads. */
export function RoleSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <Skeleton className="h-4 w-36" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="overflow-hidden rounded-[12px] border bg-card">
        <div className="h-11 border-b bg-muted/40" />
        {PERMISSION_MODULES.map((m) => (
          <div key={m} className="flex h-16 items-center gap-4 border-b px-5 last:border-b-0">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-1/2 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
