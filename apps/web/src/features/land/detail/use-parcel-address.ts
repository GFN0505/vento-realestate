import { getRouteApi } from '@tanstack/react-router'
import type { TitleStageType } from '@vento/shared'
import { useOverlayHistory } from '@/lib/overlay-history'
import type { ParcelSearch, ParcelSheet, ParcelTab } from './parcel-search'

const route = getRouteApi('/_app/_shell/land/$parcelId')

const NO_SHEET = { sheet: undefined, stage: undefined, doc: undefined } as const

/**
 * The parcel page's moves through its address: sheets, the preview, tabs and the activity page
 * live in the URL (so Back closes a sheet and a link opens the same view). A sheet opened here
 * closes with Back, so the next Back leaves the page; one opened from a link replaces its entry.
 */
export function useParcelAddress() {
  const navigate = route.useNavigate()
  const overlay = useOverlayHistory()
  const go = (patch: (prev: ParcelSearch) => ParcelSearch, replace = false) =>
    navigate({ search: patch, replace })

  return {
    openSheet: (sheet: ParcelSheet, extra: { stage?: TitleStageType; doc?: string } = {}) =>
      overlay.opened(go((prev) => ({ ...prev, ...NO_SHEET, preview: undefined, sheet, ...extra }))),
    /** The stage sheet moving to another stage keeps one history entry. */
    switchStage: (stage: TitleStageType) =>
      overlay.replaced(go((prev) => ({ ...prev, stage }), true)),
    closeSheet: () => overlay.close(() => void go((prev) => ({ ...prev, ...NO_SHEET }), true)),
    openPreview: (versionId: string) =>
      overlay.opened(go((prev) => ({ ...prev, ...NO_SHEET, preview: versionId }))),
    closePreview: () =>
      overlay.close(() => void go((prev) => ({ ...prev, preview: undefined }), true)),
    tab: (tab: ParcelTab) =>
      void go((prev) => ({ ...prev, tab: tab === 'documents' ? undefined : tab }), true),
    activityPage: (page: number) =>
      void go((prev) => ({ ...prev, page: page > 1 ? page : undefined })),
  }
}

export type ParcelAddress = ReturnType<typeof useParcelAddress>
