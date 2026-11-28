import { STALLED_AFTER_DAYS } from '@vento/shared'

/* Land & legal home copy (spec "Role homes"), beside the queue's own words in land-queue.ts. */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The tile's line: "1 stalled over 90 days". */
export const stalledLine = (stalled: number): string =>
  stalled === 0
    ? `None stalled over ${STALLED_AFTER_DAYS} days`
    : `${stalled} stalled over ${STALLED_AFTER_DAYS} days`

export const parcelsCount = (n: number): string => plural(n, 'parcel', 'parcels')

/** How long a parcel has sat at its stage: "today", "1 day", "94 days". */
export const sinceText = (days: number): string =>
  days <= 0 ? 'today' : plural(days, 'day', 'days')

export const LAND_HOME_COPY = {
  firstParcel: 'Add your first parcel',
  noParcels: 'No parcels yet',
  loadError: "Land & title couldn't load. Check your connection and try again.",
  pipelineEmpty: 'No titles under way. Parcels show here once a title stage starts.',
  pipelineNoParcels: 'Parcels show here as their titles move, stage by stage.',
  titled: 'Titled',
  uploadDocument: 'Upload document',
} as const
