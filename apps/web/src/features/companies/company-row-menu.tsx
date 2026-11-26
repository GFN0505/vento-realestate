import type { Entity } from '@vento/shared'
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, PencilIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CompanyRights } from './company-rights'

type Props = {
  company: Entity
  rights: CompanyRights
  /** The organization's last active company can't be archived. */
  lastActive: boolean
  organizationName: string
  onEdit: () => void
  onArchive: () => void
  onRestore: () => void
  /** Owners at the company limit: why Restore will open the plan message instead. */
  restoreNote: string | null
}

const trigger =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted data-[state=open]:text-foreground'

/** ⋯ on a company: Edit · Archive (active) or Restore (archived); only what the viewer may do. */
export function CompanyRowMenu({
  company,
  rights,
  lastActive,
  organizationName,
  onEdit,
  onArchive,
  onRestore,
  restoreNote,
}: Props) {
  const archived = company.status === 'archived'
  const canEdit = rights.edit && !archived
  if (!canEdit && !rights.archive) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions for ${company.name}`} className={trigger}>
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-80 min-w-56">
        {canEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon aria-hidden />
            Edit
          </DropdownMenuItem>
        )}
        {rights.archive && canEdit && <DropdownMenuSeparator />}
        {rights.archive &&
          (archived ? (
            <DropdownMenuItem onSelect={onRestore} className="items-start">
              <ArchiveRestoreIcon aria-hidden className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                Restore
                {restoreNote && (
                  <span className="text-muted-foreground text-xs">{restoreNote}</span>
                )}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={lastActive} onSelect={onArchive} className="items-start">
              <ArchiveIcon aria-hidden className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                Archive
                {lastActive && (
                  <span className="text-muted-foreground text-xs">
                    {organizationName} needs at least one active company.
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
