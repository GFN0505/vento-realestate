import type { ReleaseStage } from '@vento/shared'
import type { ReleaseRow } from '@vento/shared/console'
import { StatusBadge } from '@/components/status-badge'
import { STAGE_LABEL, STAGE_TONE } from '../words'

/** Off rose · Internal slate · Pilot blue · On emerald (spec). */
export function StageBadge({ stage }: { stage: ReleaseStage }) {
  return <StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusBadge>
}

/** "Growth, Enterprise", "Core", "AI add-on", or "None" in amber (sold in no plan). */
export function PlansText({ row }: { row: Pick<ReleaseRow, 'core' | 'addOn' | 'plans'> }) {
  if (row.core) return <span>Core</span>
  if (row.addOn) return <span>AI add-on</span>
  if (row.plans.length > 0) return <span>{row.plans.join(', ')}</span>
  return <span className="font-semibold text-status-amber-fg">None</span>
}
