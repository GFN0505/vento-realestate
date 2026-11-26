import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  /** The number, or "—" until its module ships. */
  value: ReactNode
  /** One quiet line under the number. */
  caption: ReactNode
  /** No data yet: a flat placeholder trend instead of a sparkline. */
  pending?: boolean
  className?: string
}

/**
 * A role-home number (boards HomeSales, HomeFinance…: label, value, one line). While its module
 * isn't built it shows "—" and a flat dashed trend, never a made-up figure.
 */
export function StatCard({ label, value, caption, pending = false, className }: Props) {
  return (
    <div
      className={cn('flex flex-col gap-1 rounded-[10px] border bg-card px-[18px] py-4', className)}
    >
      <span className="truncate font-semibold text-muted-foreground text-xs">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span
          className={cn(
            'font-semibold text-[22px] tabular-nums leading-tight',
            pending && 'text-muted-foreground',
          )}
        >
          {value}
        </span>
        {pending && (
          <svg aria-hidden width="56" height="20" viewBox="0 0 56 20" className="mb-1 text-border">
            <path
              d="M1 14 L11 12 L21 13 L31 9 L41 10 L55 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <span className="truncate text-muted-foreground text-xs">{caption}</span>
    </div>
  )
}
