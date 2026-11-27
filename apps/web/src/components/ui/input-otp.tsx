import { OTPInput, OTPInputContext } from 'input-otp'
import * as React from 'react'
import { cn } from '@/lib/utils'

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn('flex items-center has-disabled:opacity-60', containerClassName)}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="input-otp-group" className={cn('flex items-center', className)} {...props} />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<'div'> & { index: number }) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex items-center justify-center border-input bg-card text-foreground tabular-nums transition-[border-color] data-[active=true]:z-10 data-[active=true]:border-primary aria-invalid:border-destructive',
        className,
      )}
      {...props}
    >
      {char}
      {/*
       * Always in the DOM, shown or hidden: removing it on blur is a DOM removal at the moment
       * focus is on <body>, which Radix's focus trap reads as "focus lost" and pulls focus back to
       * the dialog, so Tab out of the code could never reach the next control.
       */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center',
          !hasFakeCaret && 'invisible',
        )}
      >
        <div className="h-6 w-px animate-caret-blink bg-foreground duration-1000" />
      </div>
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot }
