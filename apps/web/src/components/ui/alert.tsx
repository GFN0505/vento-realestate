import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-[13px] leading-[1.45] has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        success:
          'border-status-emerald-border bg-status-emerald-bg text-foreground [&>svg]:text-status-emerald-fg',
        info: 'border-status-blue-border bg-status-blue-bg text-foreground [&>svg]:text-status-blue-fg',
        warning:
          'border-status-amber-border bg-status-amber-bg text-foreground [&>svg]:text-status-amber-fg',
        destructive:
          'border-status-rose-border bg-status-rose-bg text-foreground [&>svg]:text-status-rose-fg',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 font-semibold', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1', className)}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle, alertVariants }
