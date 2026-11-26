import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: ReactNode
  /** Beside the title, e.g. a "Coming soon" badge. */
  badge?: ReactNode
  description?: ReactNode
  /** The page's primary action (one per page). */
  actions?: ReactNode
  className?: string
}

/**
 * The top of every page in the shell (board ExecutiveHome). The title takes focus after
 * navigation (useRouteFocus), so screen readers announce where you are.
 */
export function PageHeader({ title, badge, description, actions, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            tabIndex={-1}
            className="font-heading font-semibold text-[22px] leading-tight tracking-[-0.02em] sm:text-2xl"
          >
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
