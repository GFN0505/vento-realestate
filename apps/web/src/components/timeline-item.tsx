import { CheckIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TimelineMark = 'done' | 'rejected' | 'now' | 'later'

const marks: Record<TimelineMark, string> = {
  done: 'border-status-emerald bg-status-emerald-bg text-status-emerald-fg',
  rejected: 'border-status-rose bg-status-rose-bg text-status-rose-fg',
  now: 'border-status-amber bg-status-amber-bg',
  later: 'border-border bg-card',
}

type Props = {
  mark: TimelineMark
  /** "Finance review — Aisha Bello". */
  title: ReactNode
  /** "40 min ago", "Waiting". */
  meta?: ReactNode
  /** A quoted comment or a before → after line under the title. */
  detail?: ReactNode
  /** What a screen reader hears instead of the parts: "Finance review, approved by …". */
  spoken: string
  /** The last item draws no line below its mark. */
  last?: boolean
}

/**
 * TimelineItem (design-system, from the designs): a mark on a thin rail, who and what, when on
 * the right, and an optional detail. Initials and photos never appear here. Use inside an `ol`.
 */
export function TimelineItem({ mark, title, meta, detail, spoken, last = false }: Props) {
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && (
        <span aria-hidden className="absolute top-6 bottom-0 left-[9.5px] w-px bg-border" />
      )}
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]',
          marks[mark],
        )}
      >
        {mark === 'done' && <CheckIcon className="size-3" strokeWidth={3} />}
        {mark === 'rejected' && <XIcon className="size-3" strokeWidth={3} />}
        {mark === 'now' && <span className="size-1.5 rounded-full bg-status-amber" />}
      </span>
      <span className="sr-only">{spoken}</span>
      <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className={cn('min-w-0', mark === 'later' && 'text-muted-foreground')}>
            {title}
          </span>
          {meta && (
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">{meta}</span>
          )}
        </div>
        {detail && <div className="text-[13px] text-muted-foreground">{detail}</div>}
      </div>
    </li>
  )
}
