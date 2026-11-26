import type { ReleaseStage } from '@vento/shared'
import type { ReleaseDetail } from '@vento/shared/console'
import { consoleClient } from '../api'
import { ChangeDialog } from '../changes/change-dialog'
import { useChange } from '../changes/use-change'
import { plural, STAGE_LABEL } from '../words'

const setStage = consoleClient.console.releases.setStage

/**
 * "Move Sales to pilot?" with the preview (organizations by group, in-no-plan, records out of
 * view), or the kill switch's "Turn off Sales for everyone?" (spec UI copy).
 */
export function StageDialog({
  release,
  stage,
  onClose,
}: {
  release: ReleaseDetail
  stage: ReleaseStage
  onClose: () => void
}) {
  const change = useChange(setStage, onClose)
  const off = stage === 'off'
  const holders = release.holders.reduce((sum, h) => sum + h.count, 0)
  const name = release.label
  return (
    <ChangeDialog
      open
      onClose={onClose}
      change={change}
      title={
        off
          ? `Turn off ${name} for everyone?`
          : `Move ${name} to ${STAGE_LABEL[stage].toLowerCase()}?`
      }
      description={
        off
          ? `It stops for all ${plural(holders, 'organization')}, including overrides and plans. Nothing is deleted.`
          : undefined
      }
      confirmLabel={
        off ? `Turn off ${name}` : `Move ${name} to ${STAGE_LABEL[stage].toLowerCase()}`
      }
      destructive={off}
      autoPreview={() => void change.preview({ key: release.key, stage })}
    />
  )
}
