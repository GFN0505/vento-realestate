import { cn } from '@/lib/utils'

type Chip<T extends string> = { value: T; label: string }

/**
 * One-of chips held in the address (Team, Companies): pressed state, 44px on phones, and the
 * selected one in the brand tint. Counts live in the line under the title, not here.
 */
export function FilterChips<T extends string>({
  label,
  chips,
  value,
  onChange,
  className,
}: {
  label: string
  chips: readonly Chip<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <fieldset aria-label={label} className={cn('flex items-center gap-1.5', className)}>
      {chips.map((chip) => {
        const on = chip.value === value
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(chip.value)}
            className={cn(
              'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border px-3.5 font-semibold text-[13px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring md:h-8',
              on
                ? 'border-selected-border bg-selected text-selected-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {chip.label}
          </button>
        )
      })}
    </fieldset>
  )
}
