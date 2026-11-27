import { APPROVAL_COPY, type ApprovalsTab } from '@vento/shared'
import { CloudOffIcon, InboxIcon, SearchXIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const EMPTY: Record<ApprovalsTab, string> = {
  waiting: APPROVAL_COPY.emptyWaiting,
  mine: APPROVAL_COPY.emptyMine,
  decided: APPROVAL_COPY.emptyDecided,
}

/** Rows in the final layout: initials, two lines and a chip. */
export function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 border-b px-4 py-3.5 last:border-b-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** The detail pane in its final layout while the request loads. */
export function DetailSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-28 w-full rounded-[10px]" />
      <Skeleton className="h-14 w-full rounded-[10px]" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  )
}

type EmptyProps = {
  tab: ApprovalsTab
  /** The top bar's company, when one is picked. */
  entityName: string | null
  onAllEntities: () => void
}

/** "Nothing waiting for you." and the other tabs' lines; with a company, a way to all of them. */
export function ApprovalsEmpty({ tab, entityName, onAllEntities }: EmptyProps) {
  if (entityName) {
    return (
      <EmptyState
        icon={SearchXIcon}
        className="border-0"
        action={
          <Button variant="outline" onClick={onAllEntities} className="max-md:h-11">
            Show all companies
          </Button>
        }
      >
        Nothing here for {entityName}.
      </EmptyState>
    )
  }
  return (
    <EmptyState icon={InboxIcon} className="border-0">
      {EMPTY[tab]}
    </EmptyState>
  )
}

export function LoadError({
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
      className="border-0"
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
