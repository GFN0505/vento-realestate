import { Switch as SwitchPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * shadcn Switch on `radix-ui`: an on/off setting that applies as a whole (two-step for a role,
 * VAT registered). A 24px track inside a 44px touch area on phones via the caller's label.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 outline-none transition-colors duration-150',
        // Off is the muted text colour, so the track keeps 3:1 against the card in both themes.
        'bg-muted-foreground data-[state=checked]:bg-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[18px] rounded-full bg-card shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-4 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
