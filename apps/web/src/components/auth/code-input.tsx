import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'

const LENGTH = 6
const SLOTS = Array.from({ length: LENGTH }, (_, i) => i)

type Props = {
  value: string
  onChange: (value: string) => void
  /** Called once all six digits are in, typed or pasted. */
  onComplete?: (code: string) => void
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  /** `compact` fits six boxes in an indented column on a 375px phone. */
  size?: 'default' | 'compact'
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

/**
 * Six boxes, one per digit (DSAdditions → Code input). Pasting "482 135" or "482-135" fills
 * every box; phones offer the code from SMS or email through `one-time-code`.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid = false,
  disabled = false,
  autoFocus = false,
  size = 'default',
  id,
  'aria-label': ariaLabel = '6-digit code',
  'aria-describedby': describedBy,
}: Props) {
  return (
    <InputOTP
      id={id}
      maxLength={LENGTH}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      pattern={REGEXP_ONLY_DIGITS}
      pasteTransformer={(pasted) => pasted.replace(/\D/g, '').slice(0, LENGTH)}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      <InputOTPGroup className="gap-2">
        {SLOTS.map((index) => (
          <InputOTPSlot
            key={index}
            index={index}
            aria-invalid={invalid || undefined}
            className={cn(
              'h-[54px] w-[46px] rounded-lg border-[1.5px] font-semibold text-[22px] lg:h-14 lg:w-[52px]',
              size === 'compact' && 'h-12 w-10 text-xl sm:h-[54px] sm:w-[46px] sm:text-[22px]',
              invalid && 'border-destructive data-[active=true]:border-destructive',
            )}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
