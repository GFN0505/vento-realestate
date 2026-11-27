import { Link } from '@tanstack/react-router'
import type { Role } from '@vento/shared'
import { CopyIcon, EllipsisIcon, EyeIcon, HistoryIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { holders, moveFirstLine } from './role-people'

export type RoleActions = {
  /** Make a custom role from this one (needs settings create and every company). */
  duplicate: (() => void) | null
  /** 3a's preview, from this role. */
  preview: (() => void) | null
  delete: () => void
}

const trigger =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted data-[state=open]:text-foreground max-md:size-11'

/**
 * Delete for a custom role nobody holds. Held: shown disabled with who to move first, and a link
 * to them on Team.
 */
export function DeleteItem({ role, onDelete }: { role: Role; onDelete: () => void }) {
  if (role.isSystem) return null
  if (role.can.delete) {
    return (
      <DropdownMenuItem
        onSelect={onDelete}
        className="text-status-rose-fg [&_svg]:text-status-rose-fg!"
      >
        <Trash2Icon aria-hidden />
        Delete role
      </DropdownMenuItem>
    )
  }
  if (!role.can.edit || holders(role) === 0) return null
  return (
    <>
      <DropdownMenuItem disabled className="items-start">
        <Trash2Icon aria-hidden className="mt-0.5" />
        <span className="flex flex-col gap-0.5">
          Delete role
          <span className="text-muted-foreground text-xs">{moveFirstLine(role)}</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/settings/team" search={{ role: role.id }}>
          <UsersIcon aria-hidden />
          Show who has it
        </Link>
      </DropdownMenuItem>
    </>
  )
}

/** ⋯ on a roles list row: Duplicate · Preview this role · Delete role, as the viewer may. */
export function RoleRowMenu({ role, actions }: { role: Role; actions: RoleActions }) {
  const deletable = !role.isSystem && (role.can.delete || (role.can.edit && holders(role) > 0))
  if (!actions.duplicate && !actions.preview && !deletable) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions for ${role.name}`} className={trigger}>
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-80 min-w-56">
        {actions.duplicate && (
          <DropdownMenuItem onSelect={actions.duplicate}>
            <CopyIcon aria-hidden />
            Duplicate
          </DropdownMenuItem>
        )}
        {actions.preview && (
          <DropdownMenuItem onSelect={actions.preview}>
            <EyeIcon aria-hidden />
            Preview this role
          </DropdownMenuItem>
        )}
        {deletable && (actions.duplicate || actions.preview) && <DropdownMenuSeparator />}
        <DeleteItem role={role} onDelete={actions.delete} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * ⋯ on a role page: View history (for people who can read the audit log) and the delete (or who
 * to move first). Waits while there are unsaved ticks.
 */
export function RolePageMenu({
  role,
  disabled,
  history,
  onDelete,
}: {
  role: Role
  disabled: boolean
  /** The audit log, filtered to this role. */
  history: boolean
  onDelete: () => void
}) {
  const deletable = !role.isSystem && (role.can.delete || (role.can.edit && holders(role) > 0))
  if (!deletable && !history) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More actions for ${role.name}`}
        disabled={disabled}
        title={disabled ? 'Save or discard your changes first.' : undefined}
        className={`${trigger} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-80 min-w-56">
        {history && (
          <DropdownMenuItem asChild>
            <Link
              to="/settings/audit-log"
              search={{ target: 'role', targetId: role.id, about: role.name }}
            >
              <HistoryIcon aria-hidden />
              View history
            </Link>
          </DropdownMenuItem>
        )}
        {history && deletable && <DropdownMenuSeparator />}
        <DeleteItem role={role} onDelete={onDelete} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
