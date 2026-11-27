import {
  cannotApproveInModuleText,
  MAX_APPROVAL_STEPS,
  MODULE_LABELS,
  type PermissionModule,
  type Role,
  stepText,
} from '@vento/shared'
import { CheckIcon, PlusIcon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Props = {
  roles: readonly Role[] | undefined
  /** The action's module: only roles with Approve there can be picked. */
  module: PermissionModule
  value: string[][]
  onChange: (steps: string[][]) => void
  error: string | null
}

const chip =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 font-semibold text-[13px] outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring md:min-h-8'

/**
 * Approvers in order (board Edit rule): 1 to 3 steps, each one or more roles; any one person
 * holding one of them approves that step. Roles without Approve in the action's module stay
 * listed but can't be picked, and say why (spec).
 */
export function StepBuilder({ roles, module, value, onChange, error }: Props) {
  const id = useId()
  if (!roles) return <Skeleton className="h-28 w-full" />
  const names = new Map(roles.map((r) => [r.id, r.name]))
  const set = (index: number, next: string[]) =>
    onChange(value.map((step, i) => (i === index ? next : step)))

  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="flex flex-col gap-3">
      <legend className="mb-1.5 font-semibold text-sm">Approved by</legend>
      <ol className="flex flex-col gap-3">
        {value.map((step, index) => {
          const chosen = step.map((roleId) => names.get(roleId) ?? 'a removed role')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a step is its position.
            <li key={index} className="flex flex-col gap-2 rounded-[10px] border px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[13px]">
                  Step {index + 1}
                  <span className="font-normal text-muted-foreground">
                    {chosen.length > 0 ? ` · ${stepText(chosen)}` : ' · choose who approves'}
                  </span>
                </span>
                {value.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    aria-label={`Remove step ${index + 1}`}
                    className="size-8 max-md:size-11"
                  >
                    <XIcon aria-hidden />
                  </Button>
                )}
              </div>
              <fieldset aria-label={`Step ${index + 1} roles`} className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <RoleChip
                    key={role.id}
                    role={role}
                    on={step.includes(role.id)}
                    reason={
                      role.canApprove.includes(module)
                        ? null
                        : cannotApproveInModuleText(role.name, module)
                    }
                    onToggle={(on) =>
                      set(index, on ? [...step, role.id] : step.filter((r) => r !== role.id))
                    }
                  />
                ))}
              </fieldset>
            </li>
          )
        })}
      </ol>
      {roles.some((r) => !r.canApprove.includes(module)) && (
        <p className="text-muted-foreground text-xs">
          Dashed roles can't approve in {MODULE_LABELS[module]}. Give a role Approve there on its
          page first; tap one to see why.
        </p>
      )}
      {value.length < MAX_APPROVAL_STEPS && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...value, []])}
          className="-ml-2 w-fit max-md:h-11"
        >
          <PlusIcon aria-hidden />
          Add a step
        </Button>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </fieldset>
  )
}

function RoleChip({
  role,
  on,
  reason,
  onToggle,
}: {
  role: Role
  on: boolean
  /** Why it can't be picked; null when it can. */
  reason: string | null
  onToggle: (on: boolean) => void
}) {
  const reasonId = useId()
  // Tooltips don't open on touch: a tap shows the reason too.
  const [showing, setShowing] = useState(false)
  if (reason) {
    return (
      <>
        <Tooltip open={showing} onOpenChange={setShowing}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setShowing(true)}
              aria-disabled="true"
              aria-describedby={reasonId}
              className={cn(
                chip,
                'cursor-not-allowed border-dashed bg-card text-muted-foreground opacity-70',
              )}
            >
              {role.name}
            </button>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      </>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(!on)}
      className={cn(
        chip,
        on
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {on && <CheckIcon aria-hidden className="-ml-0.5 size-3.5" strokeWidth={3} />}
      {role.name}
    </button>
  )
}
