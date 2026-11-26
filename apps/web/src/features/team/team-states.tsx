import { CloudOffIcon, SearchXIcon, UserPlusIcon, UsersIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { preloadInvite, shellUi } from '@/features/shell/shell-ui'
import { cn } from '@/lib/utils'
import type { TeamShow } from './team-search'

/** Loading, in the final layout: rows on desktop, cards on phones. */
export function TeamSkeleton({ phone }: { phone: boolean }) {
  const rows = Array.from({ length: 6 }, (_, i) => i)
  if (phone) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {rows.map((i) => (
          <div
            key={i}
            className="flex h-[88px] items-center gap-3 rounded-[14px] border bg-card px-3.5"
          >
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
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
          <Skeleton className="size-8 rounded-full" />
          <div className="flex w-[28%] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-3.5 w-[10%]" />
          <Skeleton className="ml-[5%] h-3.5 w-[12%]" />
          <Skeleton className="ml-[5%] h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function InviteButtonInline({
  children = 'Invite people',
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <Button
      onPointerEnter={preloadInvite}
      onFocus={preloadInvite}
      onClick={() => shellUi.openInvite()}
      aria-keyshortcuts="i"
      className={cn('max-md:h-11', className)}
    >
      <UserPlusIcon aria-hidden />
      {children}
    </Button>
  )
}

/** Only the owner so far: their row, then this under it (spec). */
export function BringInYourTeam({ canInvite }: { canInvite: boolean }) {
  return (
    <EmptyState icon={UsersIcon} action={canInvite ? <InviteButtonInline /> : undefined}>
      <p className="font-heading font-semibold text-[15px] text-foreground">Bring in your team</p>
      <p>Invite colleagues by email and choose what each one can see.</p>
    </EmptyState>
  )
}

type EmptyProps = {
  show: TeamShow
  query: string | undefined
  onClear: () => void
  filtered: boolean
  /** The top bar's entity, when one is picked. */
  entityName: string | null
  onAllEntities: () => void
}

/** No rows: a search or role filter matched nobody, a chip is empty, or nobody in the entity. */
export function TeamEmpty({
  show,
  query,
  onClear,
  filtered,
  entityName,
  onAllEntities,
}: EmptyProps) {
  if (entityName && !filtered) {
    const what =
      show === 'removed'
        ? `Nobody who worked in ${entityName} has been removed.`
        : show === 'invited'
          ? `No open invitations for ${entityName}.`
          : `No one can work in ${entityName} yet.`
    return (
      <EmptyState
        icon={UsersIcon}
        action={
          <Button variant="outline" onClick={onAllEntities} className="max-md:h-11">
            Show all companies
          </Button>
        }
      >
        {what}
      </EmptyState>
    )
  }
  if (filtered) {
    return (
      <EmptyState
        icon={SearchXIcon}
        action={
          <Button variant="outline" onClick={onClear} className="max-md:h-11">
            Clear filters
          </Button>
        }
      >
        {query ? `No one matches "${query}".` : 'No one has this role.'}
      </EmptyState>
    )
  }
  return (
    <EmptyState icon={UsersIcon}>
      {show === 'removed' ? 'Nobody has been removed.' : 'No open invitations.'}
    </EmptyState>
  )
}

export function TeamError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <EmptyState
      icon={CloudOffIcon}
      action={
        <Button variant="outline" onClick={onRetry} disabled={retrying} className="max-md:h-11">
          Try again
        </Button>
      }
    >
      <span role="alert">Team couldn't load. Check your connection and try again.</span>
    </EmptyState>
  )
}

/** Above the list while the top bar has one entity picked. */
export function EntityScopeLine({
  name,
  onAllEntities,
}: {
  name: string
  onAllEntities: () => void
}) {
  return (
    <p className="-mb-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
      <span>
        People who can work in <span className="font-medium text-foreground">{name}</span>
      </span>
      <button
        type="button"
        onClick={onAllEntities}
        className="rounded-sm font-semibold text-link underline-offset-4 outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
      >
        Show all companies
      </button>
    </p>
  )
}
