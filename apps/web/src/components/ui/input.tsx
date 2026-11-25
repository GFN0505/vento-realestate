import type * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 48px and 16px text on phones (no iOS zoom on focus), 40px and 14px from md.
        'flex h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-[border-color] outline-none placeholder:text-muted-foreground md:h-10 md:text-sm',
        'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-muted',
        'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive/30',
        'file:border-0 file:bg-transparent file:font-medium file:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
