import { setTheme, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { THEME_OPTIONS } from './theme-icons'

/** Light / Dark / System as one segmented control (phones, in the More sheet). */
export function ThemeSegments() {
  const theme = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="mx-3 mb-1 grid grid-cols-3 gap-1 rounded-[10px] bg-muted p-1"
    >
      {THEME_OPTIONS.map((option) => {
        const checked = theme === option.value
        return (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control; native radios can't be styled as one button row without hiding them
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg font-semibold text-[13px] text-muted-foreground outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              checked && 'bg-card text-foreground shadow-sm',
            )}
          >
            <option.icon aria-hidden className="size-4" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
