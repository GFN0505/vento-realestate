import { MODULE_LABELS, PERMISSION_MODULES, type PermissionModule } from '@vento/shared'
import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ModuleActionsSheet } from './module-actions-sheet'
import { actionsInWords } from './module-lines'
import type { GridProps } from './permissions-grid'

/**
 * Phones (board PermissionsMobile): one row per module with its actions in words. On a role you
 * can edit, a tap opens six labelled switches (six 18px boxes in a row would fail 44px targets).
 */
export function PermissionsMobileList({
  roleName,
  permissions,
  saved,
  onToggle,
  ceiling,
}: GridProps) {
  const [open, setOpen] = useState<PermissionModule | null>(null)
  const [shown, setShown] = useState<PermissionModule>('land')

  return (
    <>
      <ul
        aria-label={`What ${roleName} can do`}
        className="divide-y overflow-hidden rounded-[14px] border bg-card"
      >
        {PERMISSION_MODULES.map((module) => {
          const words = actionsInWords(permissions, module)
          const changed = words !== actionsInWords(saved, module)
          const content = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 font-semibold text-[14px]">
                  {MODULE_LABELS[module]}
                  {changed && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
                </span>
                {/* A real space, so the visible text reads "Sales & CRM View" inside its name. */}{' '}
                <span
                  className={cn(
                    'text-[13px]',
                    words === 'No access' ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {words}
                </span>
              </span>
              {onToggle && (
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              )}
            </>
          )
          return (
            <li key={module}>
              {onToggle ? (
                <button
                  type="button"
                  // Starts with the visible words ("Sales & CRM … View"), then what a tap does.
                  aria-label={`${MODULE_LABELS[module]}: ${words}${changed ? ', changed' : ''}. Change`}
                  onClick={() => {
                    setShown(module)
                    setOpen(module)
                  }}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-hidden transition-colors active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-h-16 items-center gap-3 px-4 py-3">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
      {onToggle && (
        <ModuleActionsSheet
          open={open !== null}
          onOpenChange={(next) => !next && setOpen(null)}
          module={shown}
          permissions={permissions}
          saved={saved}
          ceiling={ceiling}
          onToggle={onToggle}
        />
      )}
    </>
  )
}
