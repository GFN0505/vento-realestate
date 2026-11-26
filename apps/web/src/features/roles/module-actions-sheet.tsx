import {
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type PermissionModule,
  type PermissionSet,
} from '@vento/shared'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { ACTION_HINTS, ACTION_LABELS, MODULE_LINES, SETTINGS_ACTIONS_LINE } from './module-lines'
import { CEILING_REASON } from './permission-cell'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  module: PermissionModule
  permissions: PermissionSet
  ceiling: PermissionSet | null
  onToggle: (module: PermissionModule, action: PermissionAction, on: boolean) => void
}

/** A bottom sheet of six labelled switches for one module, then Done. Changes apply as you go. */
export function ModuleActionsSheet({
  open,
  onOpenChange,
  module,
  permissions,
  ceiling,
  onToggle,
}: Props) {
  const label = MODULE_LABELS[module]
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0">
        <SheetHandle />
        <div className="flex flex-col gap-0.5 px-5 pt-2 pb-3">
          <SheetTitle>{label}</SheetTitle>
          <SheetDescription>
            {module === 'settings' ? SETTINGS_ACTIONS_LINE : MODULE_LINES[module]}
          </SheetDescription>
        </div>
        <ul className="divide-y overflow-y-auto border-y">
          {PERMISSION_ACTIONS.map((action) => {
            const on = permissions[module]?.includes(action) ?? false
            const locked = ceiling !== null && !(ceiling[module]?.includes(action) ?? false)
            const id = `module-action-${action}`
            const hint = locked ? CEILING_REASON : (ACTION_HINTS[action] ?? null)
            return (
              <li key={action}>
                <label
                  htmlFor={id}
                  className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 py-2.5 has-disabled:cursor-not-allowed"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-[15px]">{ACTION_LABELS[action]}</span>
                    {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
                  </span>
                  <Switch
                    id={id}
                    aria-label={`${label}: ${ACTION_LABELS[action]}`}
                    checked={on}
                    disabled={locked}
                    onCheckedChange={(next) => onToggle(module, action, next)}
                  />
                </label>
              </li>
            )
          })}
        </ul>
        <div className="px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button className="h-11 w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
