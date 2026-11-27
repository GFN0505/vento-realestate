import type * as React from 'react'
import { cn } from '@/lib/utils'

/** Input's look for several lines: 16px on phones (no iOS zoom), grows downward only. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-[72px] w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground hover:border-input-hover md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
