import { cn } from '@/lib/utils'

type Props = {
  className?: string
  /** Mark size in px (square). */
  size?: number
  /** Chevron stroke in viewBox units (32×32). Defaults to the brand's size-based weight. */
  strokeWidth?: number
  /**
   * The "Real Estate" product descriptor beside the wordmark. Vento has other products
   * (e.g. hotels), so it shows wherever the brand does; turn it off only for compact uses.
   */
  descriptor?: boolean
  /** `navy` on the brand panels, `surface` on cards and the page background. */
  tone?: 'navy' | 'surface'
  /** The chevron draws itself and the dot fades in, like the marketing site's loader. */
  animated?: boolean
  /** The "Vento" wordmark. Off for the mark alone (collapsed sidebar, phone header). */
  wordmark?: boolean
}

/** The brand thins the stroke and dot as the mark grows, so it reads the same at every size. */
function weights(size: number) {
  if (size <= 24) return { stroke: 3.4, dot: 2.6 }
  if (size <= 40) return { stroke: 3, dot: 2.5 }
  return { stroke: 2.6, dot: 2.4 }
}

/** The Vento mark (violet chevron, cyan dot), the "Vento" wordmark and the product descriptor. */
export function VentoMark({
  className,
  size = 28,
  strokeWidth,
  descriptor = true,
  tone = 'surface',
  animated = false,
  wordmark = true,
}: Props) {
  const weight = weights(size)
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M5 7 L16 27 L27 7"
          strokeWidth={strokeWidth ?? weight.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'stroke-logo-stroke',
            animated && '[stroke-dasharray:46] motion-safe:animate-auth-draw',
          )}
        />
        <circle
          cx="16"
          cy="10"
          r={weight.dot}
          className={cn(
            'fill-logo-dot',
            animated && 'origin-center [transform-box:fill-box] motion-safe:animate-auth-dot',
          )}
        />
      </svg>
      {wordmark ? (
        <span className="font-heading font-semibold text-[17px] tracking-[-0.01em] lg:text-lg">
          Vento
        </span>
      ) : (
        <span className="sr-only">Vento</span>
      )}
      {wordmark && descriptor && (
        <span
          className={cn(
            'whitespace-nowrap border-l py-0.5 pl-2.5 font-semibold text-[10.5px] uppercase leading-none tracking-[0.14em]',
            tone === 'navy'
              ? 'border-auth-hairline text-auth-panel-muted'
              : 'border-border text-muted-foreground',
          )}
        >
          <span className="sr-only"> </span>Real Estate
        </span>
      )}
    </span>
  )
}
