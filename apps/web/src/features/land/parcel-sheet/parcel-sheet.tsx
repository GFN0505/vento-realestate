import type { ParcelDetail } from '@vento/shared'
import { MapPinnedIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { LAND_COPY } from '@/features/land/land-words'
import { ParcelReadOnlyBanner } from '@/features/land/parcel-read-only'
import type { ParcelSheetProps } from '@/features/land/parcel-sheet-lazy'
import { SheetFrame } from '@/features/team/sheet-frame'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { EditableParcel } from './editable-parcel'
import { type Guard, SheetFooter } from './sheet-parts'

/**
 * Add parcel / Edit parcel (ParcelEditor board without the map; side-sheet archetype, full screen
 * on phones). Opened from the address (`?sheet=add`, `?sheet=edit`), so Back closes it. Closing
 * with changes asks first; a refusal keeps every field and every uploaded file.
 */
export function ParcelSheet({ open, parcel, onClose, onSaved }: ParcelSheetProps) {
  const height = useVisualViewportHeight(open)
  const guard: Guard = useRef(null)
  // A fresh form for every opening; the last parcel stays on screen while the sheet slides out.
  const [opening, setOpening] = useState({ open: false, count: 0, parcel })
  if (open !== opening.open) {
    setOpening({
      open,
      count: opening.count + (open ? 1 : 0),
      parcel: open ? parcel : opening.parcel,
    })
  }
  const shown = opening.parcel

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next || (guard.current && !guard.current())) return
        onClose()
      }}
    >
      <SheetFrame
        height={height}
        lead={<ParcelTile />}
        title={shown ? LAND_COPY.editParcel : LAND_COPY.addParcel}
        description={
          shown
            ? `${shown.reference} · ${shown.name}`
            : 'A piece of land a company owns, is buying or is considering.'
        }
      >
        {shown && (shown.readOnly || !shown.can.edit) ? (
          <ReadOnlyParcel parcel={shown} onClose={onClose} />
        ) : (
          <EditableParcel
            key={opening.count}
            parcel={shown}
            guard={guard}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </SheetFrame>
    </Sheet>
  )
}

function ParcelTile() {
  return (
    <span
      aria-hidden
      className="tile-gradient mb-2 flex size-11 items-center justify-center rounded-xl text-tile-icon"
    >
      <MapPinnedIcon className="size-5" strokeWidth={1.8} />
    </span>
  )
}

function ReadOnlyParcel({ parcel, onClose }: { parcel: ParcelDetail; onClose: () => void }) {
  return (
    <>
      {parcel.readOnly ? (
        <ParcelReadOnlyBanner parcel={parcel} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Only Land & legal can edit parcels. Ask your organization owner.
        </p>
      )}
      <SheetFooter>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} className="max-md:h-11 max-md:flex-1">
            Close
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}
