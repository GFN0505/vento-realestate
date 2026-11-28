import type { ParcelRow } from '@vento/shared'
import { cn } from '@/lib/utils'
import { STAGE_STATUS_TONE } from './land-words'

const FILL = {
  emerald: 'bg-status-emerald',
  amber: 'bg-status-amber',
  blue: 'bg-status-blue',
  rose: 'bg-status-rose',
  slate: 'bg-status-slate',
} as const

type Props = {
  parcel: Pick<ParcelRow, 'stagesGranted' | 'stagesTotal' | 'currentStage'>
  className?: string
}

/**
 * The list's title progress (board LandTitle): one short segment per stage, granted ones
 * emerald, the current one in its status colour, the rest empty. Decoration: the stage line
 * beside it says the same in words.
 */
export function StageBar({ parcel, className }: Props) {
  const { stagesGranted, stagesTotal, currentStage } = parcel
  if (stagesTotal === 0) return null
  return (
    <span aria-hidden className={cn('flex gap-[3px]', className)}>
      {Array.from({ length: stagesTotal }, (_, i) => {
        const fill =
          i < stagesGranted
            ? FILL.emerald
            : i === stagesGranted && currentStage && currentStage.status !== 'not_started'
              ? FILL[STAGE_STATUS_TONE[currentStage.status]]
              : 'bg-border'
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their place.
          <span key={i} className={cn('h-1 w-[22px] rounded-full', fill)} />
        )
      })}
    </span>
  )
}
