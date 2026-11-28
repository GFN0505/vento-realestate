import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * A dot plus a label on a tinted background, never colour alone (design-system: Status colours).
 * Text uses each status's darker shade so it passes 4.5:1 in both themes.
 */
const statusVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold text-[11px] leading-4',
  {
    variants: {
      tone: {
        emerald: 'border-status-emerald-border bg-status-emerald-bg text-status-emerald-fg',
        amber: 'border-status-amber-border bg-status-amber-bg text-status-amber-fg',
        blue: 'border-status-blue-border bg-status-blue-bg text-status-blue-fg',
        rose: 'border-status-rose-border bg-status-rose-bg text-status-rose-fg',
        slate: 'border-status-slate-border bg-status-slate-bg text-status-slate-fg',
      },
    },
    defaultVariants: { tone: 'slate' },
  },
)

const dot = {
  emerald: 'bg-status-emerald',
  amber: 'bg-status-amber',
  blue: 'bg-status-blue',
  rose: 'bg-status-rose',
  slate: 'bg-status-slate',
} as const

type Tone = NonNullable<VariantProps<typeof statusVariants>['tone']>
export type StatusTone = Tone

export function StatusBadge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn(statusVariants({ tone }), className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', dot[tone])} />
      {children}
    </span>
  )
}
