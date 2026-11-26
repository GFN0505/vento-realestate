import type { EntityType } from '@vento/shared'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const OPTIONS: { value: EntityType; label: string; hint: string }[] = [
  { value: 'spv', label: 'Project company (SPV)', hint: 'One project or phase' },
  { value: 'holding', label: 'Holding company', hint: 'Owns the SPVs, shared costs' },
]

/** Two selectable cards (board Onboarding, step 2), built on the radio group for keyboard use. */
export function EntityTypePicker({
  value,
  onChange,
}: {
  value: EntityType
  onChange: (value: EntityType) => void
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onChange(next === 'holding' ? 'holding' : 'spv')}
      aria-label="Company type"
      className="grid grid-cols-2 gap-2.5"
    >
      {OPTIONS.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'group rounded-lg border-[1.5px] bg-card p-3.5 text-left outline-hidden transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'data-[state=checked]:border-selected-border data-[state=checked]:bg-selected',
          )}
        >
          <div className="font-semibold text-sm">{option.label}</div>
          <div className="mt-0.5 text-muted-foreground text-xs group-data-[state=checked]:text-selected-foreground">
            {option.hint}
          </div>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
