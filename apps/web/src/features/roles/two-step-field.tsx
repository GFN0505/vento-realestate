import { LockIcon } from 'lucide-react'
import { useId } from 'react'
import { Switch } from '@/components/ui/switch'

type Props = {
  checked: boolean
  locked: boolean
  /** null: read-only. */
  onChange: ((on: boolean) => void) | null
}

/** "Require two-step sign-in", locked on for roles that manage money, payroll or access. */
export function TwoStepField({ checked, locked, onChange }: Props) {
  const id = useId()
  const disabled = onChange === null || locked
  return (
    <div className="flex items-center justify-between gap-4 rounded-[12px] border bg-card px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="font-semibold text-sm">
          Require two-step sign-in
        </label>
        <p id={`${id}-hint`} className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {locked && <LockIcon aria-hidden className="size-3 shrink-0" />}
          {locked
            ? "Required because this role can manage money, payroll or people's access."
            : 'A code from their phone at each sign-in.'}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onCheckedChange={(on) => onChange?.(on)}
      />
    </div>
  )
}
