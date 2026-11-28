import {
  defaultStagesFor,
  inCatalogOrder,
  type NigerianState,
  TITLE_DOCUMENTS,
  type TitleDocumentType,
  type TitleStageType,
} from '@vento/shared'

/*
 * Add parcel's stages (spec "Title stages", owner 28 Nov 2026): the state's defaults (FCT uses
 * R of O) or the ones picked with Edit stages, plus any stage whose document was dropped in, so
 * an uploaded governor's consent always has its stage. A stage with its document starts granted.
 */

export type StagePreview = { type: TitleStageType; granted: boolean; required: boolean }

/** The stages a document set is evidence for, e.g. a C of O → c_of_o. */
export function evidencedStages(types: readonly TitleDocumentType[]): Set<TitleStageType> {
  const stages = new Set<TitleStageType>()
  for (const type of types) {
    const stage = TITLE_DOCUMENTS[type].stageType
    if (stage) stages.add(stage)
  }
  return stages
}

/** What the new parcel will start with, in catalog order. */
export function previewStages(
  state: NigerianState | '',
  chosen: readonly TitleStageType[] | null,
  documentTypes: readonly TitleDocumentType[],
): StagePreview[] {
  const evidence = evidencedStages(documentTypes)
  const base = chosen ?? (state ? defaultStagesFor(state) : [])
  const types = new Set<TitleStageType>([...base, ...evidence])
  return inCatalogOrder([...types].map((type) => ({ type }))).map(({ type }) => ({
    type,
    granted: evidence.has(type),
    // Its document is here: it stays while the document does.
    required: evidence.has(type),
  }))
}

/** Sent only when the list differs from what the server would pick on its own. */
export function stagesToSend(
  state: NigerianState | '',
  preview: readonly StagePreview[],
): TitleStageType[] | undefined {
  if (!state) return undefined
  const types = preview.map((s) => s.type)
  const defaults = defaultStagesFor(state)
  const same = types.length === defaults.length && types.every((t, i) => t === defaults[i])
  return same ? undefined : types
}

/** Acquired with every stage evidenced opens as Titled (spec). */
export function opensTitled(status: string, preview: readonly StagePreview[]): boolean {
  return status === 'acquired' && preview.length > 0 && preview.every((s) => s.granted)
}
