import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Initials on the action violet (white on it is 5.2:1). Never photos (design-system). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-primary font-bold text-[11px] text-primary-foreground',
        className,
      )}
    >
      {initials(name) || '?'}
    </span>
  )
}
