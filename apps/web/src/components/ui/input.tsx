import type * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 48px and 16px text on phones (no iOS zoom on focus), 40px and 14px from md.
        'flex h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground hover:border-input-hover md:h-10 md:text-sm',
        // Focus: the brand border (3.6:1 on white) plus a soft 3px halo.
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-muted',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25',
        'file:border-0 file:bg-transparent file:font-medium file:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
