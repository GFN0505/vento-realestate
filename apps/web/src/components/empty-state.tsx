import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  icon: LucideIcon
  /** What this is and why it's empty, in one or two short lines. */
  children: ReactNode
  /** One clear next step. */
  action?: ReactNode
  className?: string
}

/** Board Main: "No encumbrances found". An icon tile, a line of copy and one action. */
export function EmptyState({ icon: Icon, children, action, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-12 text-center sm:py-16',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-6" strokeWidth={1.7} />
      </span>
      <div className="max-w-md text-[14px] text-muted-foreground leading-relaxed">{children}</div>
      {action}
    </div>
  )
}
