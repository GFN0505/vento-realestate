import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: ReactNode
  /** Beside the title: a filter, a count or one action. */
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Lists that run edge to edge (rows with their own padding). */
  flush?: boolean
}

/** Board AdminOrgDetail's section card: a titled header over a hairline, then the body. */
export function DetailCard({ title, actions, children, className, flush = false }: Props) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-[10px] border bg-card', className)}>
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-[18px]">
        <h2 className="font-heading font-semibold text-[15px]">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? '' : 'px-4 py-3 sm:px-[18px]'}>{children}</div>
    </section>
  )
}

/** One label · value line in a card, hairline between lines (board "Plan" card). */
export function FactRow({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-t py-2 text-[13px] first:border-t-0',
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-semibold tabular-nums">{children}</span>
    </div>
  )
}

/** "No overrides. …": quiet copy inside a card. */
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="py-1 text-[13px] text-muted-foreground leading-relaxed">{children}</p>
}
