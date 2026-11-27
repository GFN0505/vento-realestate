import type { PreviewLine } from '@vento/shared/console'
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONE = {
  info: { icon: InfoIcon, className: 'text-foreground', iconClass: 'text-muted-foreground' },
  warning: {
    icon: TriangleAlertIcon,
    className: 'border-status-amber-border bg-status-amber-bg text-status-amber-fg',
    iconClass: '',
  },
  danger: {
    icon: CircleAlertIcon,
    className: 'border-status-rose-border bg-status-rose-bg text-status-rose-fg',
    iconClass: '',
  },
} as const

/**
 * What the change will do, in the command's own words (spec: same preview lines). Info lines
 * read plainly; warnings are amber and dangers rose, each with an icon so colour isn't alone.
 */
export function PreviewLines({ lines }: { lines: readonly PreviewLine[] }) {
  if (lines.length === 0) return null
  return (
    <ul
      aria-label="What this change does"
      className="flex flex-col gap-2"
      data-testid="preview-lines"
    >
      {lines.map((line, i) => {
        const tone = TONE[line.tone]
        return (
          <li
            // Lines are a fixed list for one preview; their order is their identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: two lines may read the same
            key={i}
            className={cn(
              'flex items-start gap-2.5 text-[13.5px] leading-relaxed',
              line.tone !== 'info' && 'rounded-lg border px-3 py-2.5',
              tone.className,
            )}
          >
            <tone.icon aria-hidden className={cn('mt-[3px] size-4 shrink-0', tone.iconClass)} />
            <span>
              {line.tone !== 'info' && (
                <span className="sr-only">
                  {line.tone === 'warning' ? 'Warning: ' : 'Important: '}
                </span>
              )}
              {line.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
