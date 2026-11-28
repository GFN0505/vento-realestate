import type { TitleStageType } from '@vento/shared'
import { oneOf, pageParam, uuidParam } from '@/lib/search-params'

/*
 * A parcel's address: `/land/<id>?tab=activity&sheet=stage&stage=c_of_o`. Hand-written, not zod
 * (route search validation runs in the entry bundle). Sheets live here so Back closes them.
 */

/** The stage catalog, written out so the entry doesn't load shared's catalog (a test keeps it equal). */
export const STAGE_PARAM_VALUES = [
  'survey_plan',
  'excision_gazette',
  'r_of_o',
  'c_of_o',
  'deed_of_assignment',
  'governors_consent',
] as const satisfies readonly TitleStageType[]

export const PARCEL_TABS = ['documents', 'activity'] as const
export const PARCEL_SHEETS = ['edit', 'stage', 'stages', 'upload'] as const

export type ParcelTab = (typeof PARCEL_TABS)[number]
export type ParcelSheet = (typeof PARCEL_SHEETS)[number]

export type ParcelSearch = {
  /** Documents is the default tab. */
  tab?: ParcelTab
  sheet?: ParcelSheet
  /** With `sheet=stage`: which stage the Update title stage sheet opens on. */
  stage?: TitleStageType
  /** With `sheet=upload`: the vault document a new version goes to ("Upload new version"). */
  doc?: string
  /** The open preview: a document version's id (Back closes it). */
  preview?: string
  /** The activity's page (newest first); page 1 is the bare address. */
  page?: number
  /** The top bar's company (the shell's `?entity`). */
  entity?: string
}

export function validateParcelSearch(search: Record<string, unknown>): ParcelSearch {
  const sheet = oneOf(search.sheet, PARCEL_SHEETS)
  return {
    tab: oneOf(search.tab, PARCEL_TABS),
    sheet,
    // A stage only means something to the stage sheet.
    stage: sheet === 'stage' ? oneOf(search.stage, STAGE_PARAM_VALUES) : undefined,
    doc: sheet === 'upload' ? uuidParam(search.doc) : undefined,
    // A preview sits over the page, never over a sheet.
    preview: sheet ? undefined : uuidParam(search.preview),
    page: pageParam(search.page),
  }
}
