import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold text-[11px] leading-4',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        outline: 'border-border bg-card text-muted-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        // A tag on the navy sidebar (e.g. "Soon"): 5.5:1 on navy.
        sidebar:
          'border-sidebar-border bg-transparent px-1.5 py-0 text-[10px] text-sidebar-faint-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
