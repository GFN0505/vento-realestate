import type { ParcelDetail } from '@vento/shared'
import { lazy, Suspense } from 'react'

/*
 * Add / Edit parcel lives in its own chunk (zod, decimal.js, the LGA list and the upload code),
 * downloaded when someone heads for Add parcel or Edit, never with the list or the detail page.
 */

let sheetPromise: Promise<typeof import('./parcel-sheet/parcel-sheet')> | null = null

/** A failed download (offline) is forgotten, so the next attempt refetches. */
function loadParcelSheet() {
  sheetPromise ??= import('./parcel-sheet/parcel-sheet').catch((error: unknown) => {
    sheetPromise = null
    throw error
  })
  return sheetPromise
}

/** Starts the download on hover or focus of an Add parcel or Edit button. */
export function preloadParcelSheet(): void {
  loadParcelSheet().catch(() => {
    // Offline: opening the sheet tries again.
  })
}

const Sheet = lazy(() => loadParcelSheet().then((m) => ({ default: m.ParcelSheet })))

export type ParcelSheetProps = {
  open: boolean
  /** null: Add parcel. A parcel: Edit parcel (its latest detail). */
  parcel: ParcelDetail | null
  onClose: () => void
  /** After a save; Add opens the new parcel by default. */
  onSaved?: (parcel: ParcelDetail) => void
}

/**
 * Add parcel (`/land?sheet=add`) or Edit parcel (`/land/<id>?sheet=edit`). Mounts nothing until
 * first opened, then stays mounted so it can slide out.
 */
export function LazyParcelSheet(props: ParcelSheetProps) {
  if (!props.open && sheetPromise === null) return null
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  )
}
