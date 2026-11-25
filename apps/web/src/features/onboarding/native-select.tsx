import { ChevronDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * A native select styled like Input, as on the Onboarding board. Phones open their own picker
 * (easier with 37 states on a small screen) and it costs no JavaScript.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-12 w-full appearance-none rounded-md border border-input bg-card pr-9 pl-3 text-base text-foreground outline-none transition-[border-color] md:h-10 md:text-sm',
          'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40',
          'aria-invalid:border-destructive invalid:text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
