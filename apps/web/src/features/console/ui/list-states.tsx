import type { LucideIcon } from 'lucide-react'
import { CloudOffIcon, SearchXIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Loading in the final layout: table rows on desktop, cards on phones. */
export function ListSkeleton({ phone, rows = 6 }: { phone: boolean; rows?: number }) {
  const items = Array.from({ length: rows }, (_, i) => i)
  if (phone) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {items.map((i) => (
          <div
            key={i}
            className="flex h-[76px] flex-col justify-center gap-2 rounded-[14px] border bg-card px-3.5"
          >
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden className="overflow-hidden rounded-[10px] border bg-card">
      <div className="h-10 border-b bg-muted/40" />
      {items.map((i) => (
        <div key={i} className="flex h-[60px] items-center gap-6 border-b px-5 last:border-b-0">
          <div className="flex w-[28%] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-3.5 w-[12%]" />
          <Skeleton className="h-3.5 w-[10%]" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function ListError({
  what,
  onRetry,
  retrying,
}: {
  what: string
  onRetry: () => void
  retrying: boolean
}) {
  return (
    <EmptyState
      icon={CloudOffIcon}
      action={
        <Button variant="outline" onClick={onRetry} disabled={retrying} className="max-md:h-11">
          Try again
        </Button>
      }
    >
      <span role="alert">{what} couldn't load. Check your connection and try again.</span>
    </EmptyState>
  )
}

export function FilteredEmpty({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchXIcon}
      action={
        <Button variant="outline" onClick={onClear} className="max-md:h-11">
          Clear filters
        </Button>
      }
    >
      {children}
    </EmptyState>
  )
}

export function ListEmpty({ icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <EmptyState icon={icon}>{children}</EmptyState>
}
