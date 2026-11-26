import type * as React from 'react'
import { cn } from '@/lib/utils'

/** A placeholder block in the final layout's shape (board Main: Skeleton). */
function Skeleton({ className, ...props }: React.ComponentProps<'span'>) {
  // A span (shown as a block), so it's valid inside text such as a page description.
  return (
    <span
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'block animate-pulse rounded-md bg-muted motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
