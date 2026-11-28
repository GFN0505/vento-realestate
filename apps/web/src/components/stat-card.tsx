import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  /** A 16px glyph, e.g. `<Landmark className="size-4" strokeWidth={1.9} />`; it may load late. */
  icon: ReactNode
  /** The number. Omit until the module that owns it ships: the tile shows a quiet placeholder. */
  value?: ReactNode
  className?: string
}

/**
 * A role-home number (boards HomeSales, HomeFinance…): an icon in a tinted square, the label and
 * a large tabular value over a soft chart area. With no value yet it shows a refined placeholder
 * and an empty baseline: never a made-up figure or a fake trend.
 */
export function StatCard({ label, icon, value, className }: Props) {
  const empty = value === undefined
  const wash = useId()
  return (
    <div
      className={cn(
        'relative flex min-h-[128px] flex-col overflow-hidden rounded-xl border bg-card p-4 sm:min-h-[136px] sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-2.5 sm:items-center">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg tile-gradient text-tile-icon"
        >
          {icon}
        </span>
        <span className="line-clamp-2 min-w-0 font-medium text-[13px] text-muted-foreground leading-tight">
          {label}
        </span>
      </div>
      <div className="mt-3 font-heading font-semibold text-[28px] tabular-nums leading-none tracking-[-0.02em]">
        {empty ? (
          <>
            {/* A short, soft bar where the figure will sit: intentional, not a bare dash. */}
            <span
              aria-hidden
              className="inline-block h-[0.55em] w-14 rounded-full bg-muted align-middle"
            />
            <span className="sr-only">Not available yet</span>
          </>
        ) : (
          value
        )}
      </div>
      {/* The chart area: an empty baseline over a faint brand wash, ready for a real trend. */}
      <svg
        aria-hidden
        viewBox="0 0 200 48"
        preserveAspectRatio="none"
        className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-auto h-10 w-[calc(100%+2rem)] text-brand sm:w-[calc(100%+2.5rem)]"
      >
        <defs>
          <linearGradient id={wash} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="30" width="200" height="18" fill={`url(#${wash})`} />
        <line
          x1="0"
          x2="200"
          y1="30"
          y2="30"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
