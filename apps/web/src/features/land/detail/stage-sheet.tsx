import type { ParcelDetail, TitleStageType } from '@vento/shared'
import { ListChecksIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { SheetFrame } from '@/features/team/sheet-frame'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import type { Guard } from '../parcel-sheet/sheet-parts'
import { StageForm } from './stage-form'

type Props = {
  open: boolean
  parcel: ParcelDetail
  /** From the address; the current stage when missing. */
  stageType: TitleStageType | undefined
  onStage: (type: TitleStageType) => void
  onClose: () => void
}

/**
 * Update title stage (board TitleStageUpdate, TitleStageMobile; a side sheet, full screen on
 * phones). Held in the address (`?sheet=stage&stage=c_of_o`), so Back closes it. A fresh form
 * for each opening and each stage; closing with changes asks first.
 */
export function StageSheet({ open, parcel, stageType, onStage, onClose }: Props) {
  const height = useVisualViewportHeight(open)
  const guard: Guard = useRef(null)
  const [opening, setOpening] = useState({ open: false, count: 0 })
  if (open !== opening.open) setOpening({ open, count: opening.count + (open ? 1 : 0) })
  const type = stageType ?? parcel.currentStage?.type ?? parcel.stages[0]?.type
  const stage = parcel.stages.find((s) => s.type === type)

  return (
    <Sheet
      open={open && stage !== undefined}
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
            <ListChecksIcon className="size-5" strokeWidth={1.8} />
          </span>
        }
        title="Update title stage"
        description={`${parcel.name} · each update is added to the parcel's history`}
      >
        {stage && (
          <StageForm
            key={`${opening.count}:${stage.id}`}
            parcel={parcel}
            stage={stage}
            guard={guard}
            onStage={onStage}
            onClose={onClose}
          />
        )}
      </SheetFrame>
    </Sheet>
  )
}
