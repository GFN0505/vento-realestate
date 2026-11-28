import type { ParcelDetail, TitleStageType } from '@vento/shared'
import { EditStagesSheet } from './edit-stages-sheet'
import type { ParcelSheet } from './parcel-search'
import { StageSheet } from './stage-sheet'
import { UploadSheet } from './upload-sheet'

export { RemoveVersionDialog } from './remove-version-dialog'

export type ParcelActionsProps = {
  parcel: ParcelDetail
  sheet: ParcelSheet | undefined
  stage: TitleStageType | undefined
  documentId: string | undefined
  /** What the viewer may open; a sheet they can't use stays shut even from a link. */
  allowed: { stage: boolean; stages: boolean; upload: boolean }
  onStage: (type: TitleStageType) => void
  onClose: () => void
}

/**
 * The parcel page's sheets, in one chunk (zod, the form and upload
 * code), downloaded when someone heads for an action, never with the page itself.
 */
export function ParcelActionSheets({
  parcel,
  sheet,
  stage,
  documentId,
  allowed,
  onStage,
  onClose,
}: ParcelActionsProps) {
  return (
    <>
      <StageSheet
        open={sheet === 'stage' && allowed.stage}
        parcel={parcel}
        stageType={stage}
        onStage={onStage}
        onClose={onClose}
      />
      <EditStagesSheet
        open={sheet === 'stages' && allowed.stages}
        parcel={parcel}
        onClose={onClose}
      />
      <UploadSheet
        open={sheet === 'upload' && allowed.upload}
        parcel={parcel}
        documentId={documentId}
        onClose={onClose}
      />
    </>
  )
}
