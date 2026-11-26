import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: ReactNode
  /** "+6 this month", "4 end this week". */
  note?: ReactNode
  /** Amber or rose when the number needs attention. */
  tone?: 'default' | 'amber' | 'rose'
  pressed: boolean
  onClick: () => void
}

/**
 * A board AdminOrgs stat card that also filters the list (spec: "Each card filters the list").
 * Pressed shows the selected border, like the chips.
 */
export function StatButton({ label, value, note, tone = 'default', pressed, onClick }: Props) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex min-h-[84px] flex-col items-start gap-1 rounded-[10px] border bg-card px-4 py-3.5 text-left outline-hidden transition-colors hover:bg-muted/50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-sm:rounded-[14px] max-sm:px-3.5 max-sm:py-3',
        pressed && 'border-selected-border bg-selected/40',
      )}
    >
      <span className="font-semibold text-muted-foreground text-xs max-sm:text-[11px]">
        {label}
      </span>
      <span
        className={cn(
          'font-heading font-semibold text-xl tabular-nums leading-tight max-sm:text-lg',
          tone === 'amber' && 'text-status-amber-fg',
          tone === 'rose' && 'text-status-rose-fg',
        )}
      >
        {value}
      </span>
      {note && (
        <span className="text-muted-foreground text-xs tabular-nums max-sm:text-[11px]">
          {note}
        </span>
      )}
    </button>
  )
}
