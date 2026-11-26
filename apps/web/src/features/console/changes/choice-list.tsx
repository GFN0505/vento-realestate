import type { ReactNode } from 'react'
import { useId } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

/** A group's legend reads like every field label (ui/label): one label style across sheets. */
export const fieldLegend = 'mb-2 font-semibold text-muted-foreground text-xs leading-none'

type Choice<T extends string> = { value: T; label: ReactNode; note?: ReactNode }

/**
 * A short list of options as large tappable rows (plans, release groups, kinds): a radio, the
 * label and a quiet note. 48px rows on phones.
 */
export function ChoiceList<T extends string>({
  legend,
  choices,
  value,
  onChange,
  columns = 1,
}: {
  legend: string
  choices: readonly Choice<T>[]
  value: T | undefined
  onChange: (value: T) => void
  columns?: 1 | 2 | 3
}) {
  const id = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={fieldLegend}>{legend}</legend>
      <RadioGroup
        value={value ?? ''}
        onValueChange={(next) => onChange(next as T)}
        className={cn(
          'grid gap-2',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'grid-cols-3',
        )}
      >
        {choices.map((choice) => {
          const itemId = `${id}-${choice.value}`
          return (
            <label
              key={choice.value}
              htmlFor={itemId}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border bg-card px-3.5 py-3 transition-colors hover:bg-muted/50 has-data-[state=checked]:border-selected-border has-data-[state=checked]:bg-selected/40"
            >
              <RadioGroupItem id={itemId} value={choice.value} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold text-[13.5px]">{choice.label}</span>
                {choice.note && (
                  <span className="text-muted-foreground text-xs">{choice.note}</span>
                )}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
