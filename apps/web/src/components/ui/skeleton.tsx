import type * as React from 'react'
import { cn } from '@/lib/utils'

/** A placeholder block in the final layout's shape (board Main: Skeleton). */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
