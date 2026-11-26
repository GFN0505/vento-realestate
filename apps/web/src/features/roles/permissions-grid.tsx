import {
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionModule,
  type PermissionSet,
} from '@vento/shared'
import { InfoIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ACTION_LABELS, APPROVE_TOOLTIP, MODULE_LINES, SETTINGS_ACTIONS_LINE } from './module-lines'
import { PermissionCell } from './permission-cell'

export type GridProps = {
  roleName: string
  permissions: PermissionSet
  /** The saved role, to mark what changed. Same as `permissions` when read-only. */
  saved: PermissionSet
  /** null: read-only. */
  onToggle: ((module: PermissionModule, action: PermissionAction, on: boolean) => void) | null
  /** The editor's own permissions: anything beyond them can't be ticked (the ceiling). */
  ceiling: PermissionSet | null
}

const has = (set: PermissionSet | null, m: PermissionModule, a: PermissionAction) =>
  set?.[m]?.includes(a) ?? false

/**
 * The role's grid (boards SetPermissions): the ten modules down the side, the six actions across.
 * Read-only and editable grids share one layout, so nothing jumps between them.
 */
export function PermissionsGrid({ roleName, permissions, saved, onToggle, ceiling }: GridProps) {
  const lockedAny =
    onToggle !== null &&
    ceiling !== null &&
    PERMISSION_MODULES.some((m) => PERMISSION_ACTIONS.some((a) => !has(ceiling, m, a)))

  return (
    <div className="overflow-hidden rounded-[12px] border bg-card">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <caption className="sr-only">What {roleName} can do in each area</caption>
        <colgroup>
          <col />
          {PERMISSION_ACTIONS.map((a) => (
            <col key={a} className="w-[9%]" />
          ))}
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th
              scope="col"
              className="h-11 px-5 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]"
            >
              Area
            </th>
            {PERMISSION_ACTIONS.map((action) => (
              <th
                key={action}
                scope="col"
                className="h-11 px-1 text-center align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]"
              >
                {action === 'approve' ? <ApproveHeader /> : ACTION_LABELS[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {PERMISSION_MODULES.map((module) => {
            const none = (permissions[module] ?? []).length === 0
            return (
              <tr key={module} className="group transition-colors hover:bg-muted/50">
                <th scope="row" className="px-5 py-3 text-left align-middle font-normal">
                  <span className={cn('block font-semibold', none && 'text-muted-foreground')}>
                    {MODULE_LABELS[module]}
                  </span>
                  <span
                    className="block truncate text-muted-foreground text-xs"
                    title={MODULE_LINES[module]}
                  >
                    {MODULE_LINES[module]}
                  </span>
                  {module === 'settings' && (
                    <span className="mt-1 block text-pretty text-[11.5px] text-muted-foreground leading-snug">
                      {SETTINGS_ACTIONS_LINE}
                    </span>
                  )}
                </th>
                {PERMISSION_ACTIONS.map((action) => (
                  <td key={action} className="px-1 py-3 text-center align-middle">
                    <PermissionCell
                      module={module}
                      moduleLabel={MODULE_LABELS[module]}
                      action={action}
                      allowed={has(permissions, module, action)}
                      changed={has(permissions, module, action) !== has(saved, module, action)}
                      locked={ceiling !== null && !has(ceiling, module, action)}
                      onChange={onToggle && ((on) => onToggle(module, action, on))}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {lockedAny && (
        <p className="flex items-center gap-2 border-t bg-muted/40 px-5 py-2.5 text-muted-foreground text-xs">
          <InfoIcon aria-hidden className="size-3.5 shrink-0" />
          Greyed boxes are actions you don't have yourself. You can only give access you have.
        </p>
      )}
    </div>
  )
}

function ApproveHeader() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm font-semibold uppercase tracking-[0.04em] underline decoration-border decoration-dotted underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          Approve
          <span className="sr-only">: {APPROVE_TOOLTIP}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="normal-case tracking-normal">{APPROVE_TOOLTIP}</TooltipContent>
    </Tooltip>
  )
}
