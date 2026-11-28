import type { ParcelDetail } from '@vento/shared'
import { UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { SheetFrame } from '@/features/team/sheet-frame'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import type { Guard } from '../parcel-sheet/sheet-parts'
import { DETAIL_COPY } from './detail-words'
import { UploadForm } from './upload-form'

type Props = {
  open: boolean
  parcel: ParcelDetail
  /** `?doc=<id>`: Upload new version of that row. */
  documentId: string | undefined
  onClose: () => void
}

/**
 * Upload document (`pattern`, from the ParcelDetail board's upload sheet): one file, its type,
 * its facts. Held in the address (`?sheet=upload`), so Back closes it; full screen on phones.
 */
export function UploadSheet({ open, parcel, documentId, onClose }: Props) {
  const height = useVisualViewportHeight(open)
  const guard: Guard = useRef(null)
  const [opening, setOpening] = useState({ open: false, count: 0 })
  if (open !== opening.open) setOpening({ open, count: opening.count + (open ? 1 : 0) })
  const doc = parcel.documents.find((d) => d.id === documentId)

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
        lead={
          <span
            aria-hidden
            className="tile-gradient mb-2 flex size-11 items-center justify-center rounded-xl text-tile-icon"
          >
            <UploadIcon className="size-5" strokeWidth={1.8} />
          </span>
        }
        title={doc ? 'Upload new version' : DETAIL_COPY.uploadDocument}
        description={`${parcel.reference} · ${parcel.name}`}
      >
        <UploadForm
          key={`${opening.count}:${documentId ?? ''}`}
          parcel={parcel}
          doc={doc}
          guard={guard}
          onClose={onClose}
        />
      </SheetFrame>
    </Sheet>
  )
}
