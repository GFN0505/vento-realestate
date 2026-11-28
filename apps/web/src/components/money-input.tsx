import { type ComponentProps, type Ref, useId, useLayoutEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/*
 * A naira amount (design-system MoneyInput). The value is a decimal string ("840000000.50"),
 * never a number: what's shown is that string with thousands commas, and every edit hands back
 * the string without them. Only ₦ today; other currencies arrive with foreign receipts.
 */

/** "₦1,250,000.5" → "1250000.5": digits and one point, at most 2 decimals. Never rounds. */
export function cleanMoneyText(text: string): string {
  const kept = text.replace(/[^\d.]/g, '')
  const point = kept.indexOf('.')
  if (point === -1) return stripZeros(kept)
  const whole = stripZeros(kept.slice(0, point))
  const fraction = kept
    .slice(point + 1)
    .replace(/\./g, '')
    .slice(0, 2)
  return `${whole || '0'}.${fraction}`
}

/** Leading zeros go ("007" → "7"), but a lone "0" stays. */
const stripZeros = (digits: string) => digits.replace(/^0+(?=\d)/, '')

/** "1250000.5" → "1,250,000.5", as typed (no padding to 2 decimals while editing). */
export function groupMoneyText(clean: string): string {
  const [whole = '', fraction] = clean.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

/** How many digits (and the point) sit before `caret` in `text`: the caret survives regrouping. */
function significantBefore(text: string, caret: number): number {
  return text.slice(0, caret).replace(/[^\d.]/g, '').length
}

function caretAfter(text: string, count: number): number {
  if (count === 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i += 1) {
    if (/[\d.]/.test(text.charAt(i))) seen += 1
    if (seen === count) return i + 1
  }
  return text.length
}

type Props = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'defaultValue' | 'ref'
> & {
  /** The decimal string, '' for none. */
  value: string
  onChange: (value: string) => void
  /** e.g. react-hook-form's `field.ref`, so a failed submit can focus it. */
  ref?: Ref<HTMLInputElement>
}

export function MoneyInput({
  value,
  onChange,
  className,
  ref: outer,
  'aria-describedby': describedBy,
  ...props
}: Props) {
  const currencyId = useId()
  const ref = useRef<HTMLInputElement | null>(null)
  const setRef = (node: HTMLInputElement | null) => {
    ref.current = node
    if (typeof outer === 'function') outer(node)
    else if (outer) outer.current = node
  }
  // Where the caret should land after the next render, counted in digits.
  const pendingCaret = useRef<number | null>(null)
  const shown = groupMoneyText(value)

  useLayoutEffect(() => {
    const input = ref.current
    const count = pendingCaret.current
    if (!input || count === null || document.activeElement !== input) return
    pendingCaret.current = null
    const at = caretAfter(shown, count)
    input.setSelectionRange(at, at)
  }, [shown])

  return (
    <div className="relative">
      <span
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground text-sm"
      >
        ₦
      </span>
      <Input
        ref={setRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={shown}
        aria-describedby={describedBy ? `${currencyId} ${describedBy}` : currencyId}
        onChange={(event) => {
          const input = event.currentTarget
          if ((input.value.match(/\./g) ?? []).length > 1) {
            // A second point is refused, not merged ("1.5" + "." stays "1.5"); the caret stays put.
            pendingCaret.current = null
            const at = Math.max(0, (input.selectionStart ?? 1) - 1)
            window.requestAnimationFrame(() => input.setSelectionRange(at, at))
            return
          }
          const clean = cleanMoneyText(input.value)
          pendingCaret.current = significantBefore(input.value, input.selectionStart ?? 0)
          onChange(clean)
        }}
        className={cn('pl-7 tabular-nums', className)}
        {...props}
      />
      <span id={currencyId} className="sr-only">
        in naira
      </span>
    </div>
  )
}
