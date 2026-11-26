import { ArchiveIcon, Building2Icon, CloudOffIcon, PlusIcon, SearchXIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { preloadCompanySheet } from '@/features/shell/shell-ui'
import { cn } from '@/lib/utils'

/** Loading, in the final layout: rows on desktop, cards on phones. */
export function CompaniesSkeleton({ phone }: { phone: boolean }) {
  const rows = [0, 1, 2, 3]
  if (phone) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {rows.map((i) => (
          <div
            key={i}
            className="flex h-[80px] flex-col justify-center gap-2 rounded-[14px] border bg-card px-3.5"
          >
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-56" />
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
          <div className="flex w-[40%] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-3.5 w-[12%]" />
          <Skeleton className="ml-[6%] h-3.5 w-[12%]" />
          <Skeleton className="ml-[6%] h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function AddCompanyButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      onPointerEnter={preloadCompanySheet}
      onFocus={preloadCompanySheet}
      onClick={onClick}
      aria-keyshortcuts="n"
      className={cn('max-md:h-11', className)}
    >
      <PlusIcon aria-hidden />
      Add company
    </Button>
  )
}

type EmptyProps = {
  archived: boolean
  query: string | undefined
  onClear: () => void
}

/** No rows: a search matched nothing, nothing is archived, or no active company is left. */
export function CompaniesEmpty({ archived, query, onClear }: EmptyProps) {
  if (query) {
    return (
      <EmptyState
        icon={SearchXIcon}
        action={
          <Button variant="outline" onClick={onClear} className="max-md:h-11">
            Clear search
          </Button>
        }
      >
        No {archived ? 'archived ' : ''}companies match "{query}".
      </EmptyState>
    )
  }
  if (archived) {
    return (
      <EmptyState icon={ArchiveIcon}>
        <p className="font-heading font-semibold text-[15px] text-foreground">
          No archived companies.
        </p>
        <p>A company you archive keeps its records and RC number, and you can restore it.</p>
      </EmptyState>
    )
  }
  return (
    <EmptyState icon={Building2Icon}>
      You don't have access to any active company. Ask an owner to give you access.
    </EmptyState>
  )
}

export function CompaniesError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <EmptyState
      icon={CloudOffIcon}
      action={
        <Button variant="outline" onClick={onRetry} disabled={retrying} className="max-md:h-11">
          Try again
        </Button>
      }
    >
      <span role="alert">Companies couldn't load. Check your connection and try again.</span>
    </EmptyState>
  )
}
