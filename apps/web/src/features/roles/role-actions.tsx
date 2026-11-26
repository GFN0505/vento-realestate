import { Link } from '@tanstack/react-router'
import type { Role } from '@vento/shared'
import { CopyIcon, EllipsisIcon, EyeIcon, Trash2Icon, UsersIcon } from 'lucide-react'
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
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted data-[state=open]:text-foreground max-md:size-11'

/** Delete for a custom role nobody holds; otherwise who to move first, linked to Team. */
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
    <DropdownMenuItem asChild>
      <Link to="/settings/team" search={{ role: role.id }}>
        <UsersIcon aria-hidden />
        {moveFirstLine(role)}
      </Link>
    </DropdownMenuItem>
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

/** ⋯ on a role page: only the delete (or who to move first). Waits while there are unsaved ticks. */
export function RolePageMenu({
  role,
  disabled,
  onDelete,
}: {
  role: Role
  disabled: boolean
  onDelete: () => void
}) {
  if (role.isSystem || !(role.can.delete || (role.can.edit && holders(role) > 0))) return null
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
        <DeleteItem role={role} onDelete={onDelete} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
