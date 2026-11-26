import type { PermissionAction, PermissionModule } from '@vento/shared'
import { CheckIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ACTION_LABELS } from './module-lines'

export const CEILING_REASON = 'You can only give access you have yourself.'

type Props = {
  module: PermissionModule
  moduleLabel: string
  action: PermissionAction
  allowed: boolean
  /** null: read-only (built-in, your own role…): a static tick, no input. */
  onChange: ((on: boolean) => void) | null
  /** Beyond the editor's own permissions: shown, but can't be ticked. */
  locked: boolean
  /** Differs from the saved role: a brand dot, so changes are easy to spot before saving. */
  changed: boolean
}

/**
 * PermissionCell (design system): allowed (filled tick) or not allowed (empty). The "up to a
 * limit" state arrives with approval rules in brick 4. Editable cells are real checkboxes named
 * "Projects: Create", so Tab and Space work; read-only cells look the same, minus the input.
 */
export function PermissionCell({
  module,
  moduleLabel,
  action,
  allowed,
  onChange,
  locked,
  changed,
}: Props) {
  const name = `${moduleLabel}: ${ACTION_LABELS[action]}`
  if (!onChange) {
    return allowed ? (
      <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-primary text-primary-foreground">
        <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
        <span className="sr-only">Allowed</span>
      </span>
    ) : (
      <span className="inline-flex size-[18px] items-center justify-center">
        <span aria-hidden className="size-1 rounded-full bg-border" />
        <span className="sr-only">Not allowed</span>
      </span>
    )
  }
  const box = (
    <span className="relative inline-flex">
      <Checkbox
        aria-label={name}
        data-cell={`${module}:${action}`}
        checked={allowed}
        disabled={locked}
        onCheckedChange={(next) => onChange(next === true)}
        className={cn('size-5', locked && 'cursor-not-allowed')}
      />
      {changed && (
        <span
          aria-hidden
          className="-top-1 -right-1 absolute size-2 rounded-full border-2 border-card bg-brand"
        />
      )}
    </span>
  )
  if (!locked) return box
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled inputs get no pointer events; the wrapper carries the reason. */}
        <span tabIndex={-1} className="inline-flex">
          {box}
        </span>
      </TooltipTrigger>
      <TooltipContent>{CEILING_REASON}</TooltipContent>
    </Tooltip>
  )
}
