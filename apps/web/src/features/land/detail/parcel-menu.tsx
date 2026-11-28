import { ArchiveIcon, EllipsisIcon, ListChecksIcon, PencilIcon, UploadIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type LazyMenuProps, useAutoFocus } from '@/components/ui/lazy-menu'
import { LAND_COPY } from '../land-words'
import { DETAIL_COPY } from './detail-words'
import { menuTrigger } from './menu-trigger'

/** Each action is null when the viewer can't take it. */
export type ParcelMenuActions = {
  upload: (() => void) | null
  editParcel: (() => void) | null
  editStages: (() => void) | null
  archive: (() => void) | null
}

/** The header's ⋯ menu, loaded when someone heads for it (Radix stays out of the page chunk). */
export function ParcelMenu({
  defaultOpen,
  autoFocus,
  actions,
}: LazyMenuProps & { actions: ParcelMenuActions }) {
  const trigger = useAutoFocus<HTMLButtonElement>(autoFocus)
  const { upload, editParcel, editStages, archive } = actions
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger ref={trigger} aria-label="More actions" className={menuTrigger}>
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {upload && (
          // Desktop: the vault card has its own Upload document; phones, the sticky bar.
          <DropdownMenuItem onSelect={upload} className="max-md:min-h-11">
            <UploadIcon aria-hidden />
            {DETAIL_COPY.uploadDocument}
          </DropdownMenuItem>
        )}
        {upload && (editParcel || editStages) && <DropdownMenuSeparator />}
        {editParcel && (
          <DropdownMenuItem onSelect={editParcel} className="max-md:min-h-11">
            <PencilIcon aria-hidden />
            {LAND_COPY.editParcel}
          </DropdownMenuItem>
        )}
        {editStages && (
          <DropdownMenuItem onSelect={editStages} className="max-md:min-h-11">
            <ListChecksIcon aria-hidden />
            {DETAIL_COPY.editStages}
          </DropdownMenuItem>
        )}
        {archive && (upload || editParcel || editStages) && <DropdownMenuSeparator />}
        {archive && (
          <DropdownMenuItem variant="destructive" onSelect={archive} className="max-md:min-h-11">
            <ArchiveIcon aria-hidden />
            Archive parcel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
