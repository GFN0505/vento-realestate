import {
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionModule,
  type PermissionSet,
} from '@vento/shared'
import { InfoIcon, LockIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ACTION_LABELS, APPROVE_TOOLTIP, MODULE_LINES, SETTINGS_ACTIONS_LINE } from './module-lines'
import { CEILING_REASON, CEILING_REASON_ID, PermissionCell } from './permission-cell'

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
      {/* Arrow keys move between boxes, like a spreadsheet; Tab still walks them in order. */}
      <table
        className="w-full table-fixed border-collapse text-[13px]"
        onKeyDown={onToggle ? moveFocus : undefined}
      >
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
                  {module === 'settings' && <SettingsCovers />}
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
          <LockIcon aria-hidden className="size-3.5 shrink-0" />
          <span id={CEILING_REASON_ID}>{CEILING_REASON}</span>
          <span>Boxes with a lock are actions you don't have.</span>
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
          className="inline-flex items-center gap-1 rounded-sm font-semibold uppercase tracking-[0.04em] underline decoration-border decoration-dotted underline-offset-4 outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
        >
          Approve
          <span className="sr-only">: {APPROVE_TOOLTIP}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="normal-case tracking-normal">{APPROVE_TOOLTIP}</TooltipContent>
    </Tooltip>
  )
}

/** Settings' actions aren't obvious; the explanation waits behind one quiet link. */
function SettingsCovers() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="mt-0.5 inline-flex items-center gap-1 rounded-sm text-link text-xs outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
        >
          <InfoIcon aria-hidden className="size-3" />
          What this covers
          <span className="sr-only">: {SETTINGS_ACTIONS_LINE}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm leading-relaxed">{SETTINGS_ACTIONS_LINE}</TooltipContent>
    </Tooltip>
  )
}

const MODULE_INDEX = new Map(PERMISSION_MODULES.map((m, i) => [m, i]))
const ACTION_INDEX = new Map(PERMISSION_ACTIONS.map((a, i) => [a, i]))
const STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function moveFocus(event: KeyboardEvent<HTMLTableElement>) {
  const step = STEPS[event.key]
  const at = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]')?.dataset.cell
  if (!step || !at) return
  const [module, action] = at.split(':') as [PermissionModule, PermissionAction]
  const row = (MODULE_INDEX.get(module) ?? 0) + step[0]
  const col = (ACTION_INDEX.get(action) ?? 0) + step[1]
  const next = event.currentTarget.querySelector<HTMLElement>(
    `[data-cell="${PERMISSION_MODULES[row]}:${PERMISSION_ACTIONS[col]}"]`,
  )
  if (!next) return
  event.preventDefault()
  next.focus()
}
