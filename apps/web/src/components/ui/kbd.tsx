import type * as React from 'react'
import { cn } from '@/lib/utils'

/** A key cap: "⌘K", "Esc", "?" (board ExecutiveHome: search bar and palette). */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border bg-card px-1.5 font-sans font-semibold text-[11px] text-muted-foreground leading-none',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
