import type { PermissionAction, PermissionModule } from '@vento/shared'
import { CheckIcon, LockIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ACTION_LABELS } from './module-lines'

export const CEILING_REASON = 'You can only give access you have yourself.'
/** The grid renders this text once (visually hidden); locked cells point at it. */
export const CEILING_REASON_ID = 'permission-ceiling-reason'

type Props = {
  module: PermissionModule
  moduleLabel: string
  action: PermissionAction
  allowed: boolean
  /** null: read-only (built-in, your own role…): a static tick, no input. */
  onChange: ((on: boolean) => void) | null
  /** Beyond the editor's own permissions: shown, focusable, but can't be ticked. */
  locked: boolean
  /** Differs from the saved role: a brand ring, so changes are easy to spot before saving. */
  changed: boolean
}

const cellId = (module: PermissionModule, action: PermissionAction) => `${module}:${action}`

/**
 * PermissionCell (design system): allowed (filled tick) or not allowed (empty). The "up to a
 * limit" state arrives with approval rules in brick 4. Editable cells are real checkboxes named
 * "Projects: Create", so Tab, Space and the arrow keys work; read-only cells look the same, minus
 * the input. A locked cell stays focusable and says why it can't change.
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
        <span aria-hidden className="size-1.5 rounded-full bg-control-border" />
        <span className="sr-only">Not allowed</span>
      </span>
    )
  }
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A checkbox that can't change: focusable, so keyboard and screen readers get why. */}
          {/* biome-ignore lint/a11y/useSemanticElements: a disabled input can't take focus, and this one must, to say why it's locked */}
          <span
            role="checkbox"
            tabIndex={0}
            aria-checked={allowed}
            aria-disabled
            aria-label={name}
            aria-describedby={CEILING_REASON_ID}
            data-cell={cellId(module, action)}
            className="inline-flex size-5 cursor-not-allowed items-center justify-center rounded-[5px] border border-dashed border-control-border bg-muted text-muted-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <LockIcon aria-hidden className="size-2.5" strokeWidth={2.5} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{CEILING_REASON}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Checkbox
      aria-label={name}
      data-cell={cellId(module, action)}
      checked={allowed}
      onCheckedChange={(next) => onChange(next === true)}
      className={cn(
        'size-5',
        changed && 'ring-2 ring-brand ring-offset-2 ring-offset-card motion-safe:animate-in',
      )}
    />
  )
}
