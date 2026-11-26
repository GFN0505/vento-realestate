import type { LucideIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/utils'

type SectionProps = {
  title: string
  description?: ReactNode
  /** One action in the header, e.g. "Sign out other devices". */
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}

/** A My security card (archetype: settings page): title, one line, then rows. */
export function SecuritySection({
  title,
  description,
  action,
  children,
  className,
  id,
}: SectionProps) {
  const titleId = useId()
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn(
        'scroll-mt-24 overflow-hidden rounded-[12px] border border-card-border bg-card',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5 pt-4 pb-3.5 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="font-heading font-semibold text-base leading-snug">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="flex flex-col divide-y border-t">{children}</div>
    </section>
  )
}

type Tone = 'neutral' | 'brand' | 'emerald' | 'amber'

const TILE: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-selected text-selected-foreground',
  emerald: 'bg-status-emerald-bg text-status-emerald-fg',
  amber: 'bg-status-amber-bg text-status-amber-fg',
}

type RowProps = {
  icon: LucideIcon
  tone?: Tone
  /** The row's name; with `badge` beside it. */
  label: ReactNode
  badge?: ReactNode
  /** One or two lines of status under the label. */
  children?: ReactNode
  /** The one action on the right (under the text on phones). */
  action?: ReactNode
  /** A short action (Sign out, ⋯) stays on the right on phones too, keeping lists compact. */
  inlineAction?: boolean
  className?: string
}

/**
 * One fact and its action (spec: "each a label, one line of status, and one action on the
 * right"). Phones: the action drops under the text so long labels never squeeze.
 */
export function SecurityRow({
  icon: Icon,
  tone = 'neutral',
  label,
  badge,
  children,
  action,
  inlineAction = false,
  className,
}: RowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6',
        inlineAction && action && 'grid-cols-[auto_minmax(0,1fr)_auto]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-9 items-center justify-center self-start rounded-[10px] transition-colors sm:self-center',
          TILE[tone],
        )}
      >
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-sm">{label}</span>
          {badge}
        </div>
        {children && (
          <div className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">{children}</div>
        )}
      </div>
      {action && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 sm:col-start-3 sm:justify-end',
            inlineAction ? 'col-start-3 row-start-1' : 'col-start-2',
          )}
        >
          {action}
        </div>
      )}
    </div>
  )
}
