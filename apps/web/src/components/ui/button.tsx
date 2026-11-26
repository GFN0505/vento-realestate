import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent font-semibold text-sm transition-[color,background-color,border-color,box-shadow,opacity,translate] duration-150 ease-out outline-hidden active:translate-y-px focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Depth: a soft shadow and a 1px light top edge; deeper fill and lift on hover.
        default:
          'bg-primary text-primary-foreground shadow-button-primary hover:bg-primary-hover hover:shadow-button-primary-hover active:shadow-button-primary',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        outline: 'border-border bg-card text-foreground hover:bg-muted',
        secondary: 'border-border bg-muted text-foreground hover:bg-border/60',
        ghost: 'text-foreground hover:bg-muted',
        link: 'h-auto px-0 font-medium text-link underline-offset-4 hover:text-link-hover hover:underline',
      },
      size: {
        default: 'h-10 px-4 text-[13px] has-[>svg]:px-3',
        sm: 'h-8 px-3 text-xs has-[>svg]:px-2.5',
        // The main action on sign-in and onboarding screens: 44px tall for touch.
        lg: 'h-11 px-4 text-[15px]',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
