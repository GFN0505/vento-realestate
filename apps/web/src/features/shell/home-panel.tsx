import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  /** Beside the title: a quiet note ("Sorted by due date, then impact") or one link. */
  aside?: ReactNode
  children: ReactNode
  /** Rows that run edge to edge carry their own padding (the queue). */
  flush?: boolean
  className?: string
}

/**
 * A role home's panel (board HomeLand: Your queue, Title pipeline, Encumbrances): a titled card
 * over a hairline. Each module fills its own panels; this is only the frame, so they all match.
 */
export function HomePanel({ title, aside, children, flush = false, className }: Props) {
  return (
    <section
      aria-label={title}
      className={cn('min-w-0 overflow-hidden rounded-xl border bg-card', className)}
    >
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-3 sm:px-5">
        <h2 className="font-heading font-semibold text-[15px]">{title}</h2>
        {aside && <div className="text-muted-foreground text-xs">{aside}</div>}
      </div>
      <div className={flush ? '' : 'px-4 py-4 sm:px-5'}>{children}</div>
    </section>
  )
}

/** A panel's quiet line when it has nothing to show. */
export function HomePanelNote({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground leading-relaxed">{children}</p>
}
