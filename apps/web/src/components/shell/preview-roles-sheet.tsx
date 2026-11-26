import { CheckIcon, ChevronLeftIcon } from 'lucide-react'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { useShellActions } from '@/features/shell/use-shell-actions'
import { cn } from '@/lib/utils'
import { sheetRow } from './more-sheet'
import { PreviewRoles } from './preview-roles'

/** The More sheet's second view: pick a role to preview (owners and admins). */
export function PreviewRolesSheet({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const access = useEffectiveAccess()
  const actions = useShellActions()
  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" onClick={onBack} className={cn(sheetRow, 'font-semibold')}>
        <ChevronLeftIcon aria-hidden />
        Preview as role
      </button>
      <p className="px-3 pb-2 text-muted-foreground text-xs">
        Navigation and Home become the role's. You keep your own access.
      </p>
      <PreviewRoles
        row={(role) => (
          <button
            key={role.id}
            type="button"
            aria-current={access.previewing?.id === role.id ? 'true' : undefined}
            onClick={() => {
              actions.preview(role.id)
              onDone()
            }}
            className={sheetRow}
          >
            <span className="flex-1">{role.name}</span>
            {access.previewing?.id === role.id && (
              <CheckIcon aria-label="Previewing" className="text-brand!" />
            )}
          </button>
        )}
        status={(message, retry) => (
          <button
            type="button"
            disabled={!retry}
            onClick={retry}
            className={cn(sheetRow, 'text-muted-foreground')}
          >
            {message}
          </button>
        )}
      />
      {access.previewing && (
        <button
          type="button"
          onClick={() => {
            actions.stopPreview()
            onDone()
          }}
          className={cn(sheetRow, 'mt-1 border-t pt-1')}
        >
          Stop preview
        </button>
      )}
    </div>
  )
}
