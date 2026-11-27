import { Link } from '@tanstack/react-router'
import { BadgeCheckIcon } from 'lucide-react'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { canView, navItem } from '@/features/shell/nav'
import { cn } from '@/lib/utils'

/*
 * The Approvals count (spec: in the top bar and sidebar, no bell). It comes from `me`, which is
 * refetched every 30 seconds of use and on tab focus, so it never needs a request of its own.
 */

/** Requests waiting for this person, or 0 while Approvals is hidden (e.g. previewing Sales). */
export function useApprovalsWaiting(): number {
  const me = useMe()
  const access = useEffectiveAccess()
  return canView(access, navItem('approvals')) ? me.approvalsWaiting : 0
}

/** "4 waiting for you", for screen readers beside a visible number. */
export function waitingWords(count: number): string {
  return `${count} waiting for you`
}

/** The pill beside "Approvals". Nothing at zero: an empty count is noise. */
export function CountPill({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-[11px] text-primary-foreground tabular-nums leading-none',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Top bar, from md (board Approvals): "Approvals 4". Phones have the tab or More instead. */
export function ApprovalsTopBarLink() {
  const access = useEffectiveAccess()
  const count = useApprovalsWaiting()
  if (!canView(access, navItem('approvals'))) return null
  return (
    <Link
      to="/approvals"
      preload="intent"
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border bg-card px-3 font-semibold text-[13px] outline-hidden transition-colors hover:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
    >
      <BadgeCheckIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.8} />
      Approvals
      <CountPill count={count} />
      {/* Words after the visible name, not an aria-label that rewords it (WCAG 2.5.3). */}
      {count > 0 && <span className="sr-only">, {waitingWords(count)}</span>}
    </Link>
  )
}
