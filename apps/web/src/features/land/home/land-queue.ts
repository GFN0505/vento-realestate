import {
  documentTypeForStage,
  type LandQueueItem,
  TITLE_DOCUMENTS,
  type TitleStageType,
} from '@vento/shared'
import { stageLabel } from '@/features/land/land-words'
import type { HomeQueueItem } from '@/features/shell/home-queue'
import { formatDate, formatDayMonth } from '@/lib/format'

/*
 * The Land & legal queue in words (spec "Role homes"): a registry query to answer, a follow-up
 * that's due, a stage with no movement for 90 days. Each leads to Update title stage on that
 * stage; none is ticked off, it leaves when the stage changes.
 */

export type LandQueueRow = HomeQueueItem & { parcelId: string; stageType: TitleStageType }

export const LAND_QUEUE_LIMIT = 20

/** The one with more at stake first, when two fall on the same day. */
const IMPACT: Record<LandQueueItem['kind'], number> = { query: 0, follow_up: 1, stalled: 2 }

/** "survey plan", "C of O", "governor's consent": the stage as it reads mid-sentence. */
const stageWord = (type: TitleStageType) => TITLE_DOCUMENTS[documentTypeForStage(type)].word

/** "3 Nov" this year, "3 Nov 2025" before it. */
const when = (date: string, today: string) =>
  date.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(date) : formatDate(date)

function words(item: LandQueueItem, today: string): Omit<HomeQueueItem, 'key' | 'action'> {
  switch (item.kind) {
    case 'query':
      return {
        title: "Answer the registry's query",
        meta: `${stageLabel(item.stageType)}, ${item.parcelName}`,
        due: { text: `Queried ${when(item.due, today)}`, tone: 'amber', badge: 'Query' },
      }
    case 'follow_up':
      return {
        title: `Follow up ${stageWord(item.stageType)}`,
        meta: item.parcelName,
        due:
          item.days <= 0
            ? { text: 'Today', tone: 'amber', badge: 'Due' }
            : { text: `Due ${when(item.due, today)}`, tone: 'rose', badge: 'Late' },
      }
    case 'stalled':
      return {
        title: `No movement on ${stageWord(item.stageType)} for ${item.days} days`,
        meta: item.parcelName,
        due: { text: `Since ${when(item.due, today)}`, tone: 'rose', badge: 'Stalled' },
      }
  }
}

/** Oldest due first, then by impact, then by parcel name; at most 20. */
export function landQueueRows(items: readonly LandQueueItem[], today: string): LandQueueRow[] {
  return [...items]
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) ||
        IMPACT[a.kind] - IMPACT[b.kind] ||
        a.parcelName.localeCompare(b.parcelName, 'en', { sensitivity: 'base' }),
    )
    .slice(0, LAND_QUEUE_LIMIT)
    .map((item) => ({
      key: `${item.kind}:${item.stageId}`,
      action: 'Update stage',
      parcelId: item.parcelId,
      stageType: item.stageType,
      ...words(item, today),
    }))
}
