import { lazy, Suspense } from 'react'
import type { ParcelActionsProps } from './parcel-actions'
import type { RemoveTarget } from './remove-version-dialog'

/*
 * The parcel page's sheets and dialogs live in their own chunk, downloaded on hover or focus of
 * an action (or at once when the address already holds a sheet), never with the page.
 */

let actionsPromise: Promise<typeof import('./parcel-actions')> | null = null

/** A failed download (offline) is forgotten, so the next attempt refetches. */
function loadActions() {
  actionsPromise ??= import('./parcel-actions').catch((error: unknown) => {
    actionsPromise = null
    throw error
  })
  return actionsPromise
}

export function preloadParcelActions(): void {
  loadActions().catch(() => {
    // Offline: opening the sheet tries again.
  })
}

const Sheets = lazy(() => loadActions().then((m) => ({ default: m.ParcelActionSheets })))
const Remove = lazy(() => loadActions().then((m) => ({ default: m.RemoveVersionDialog })))

/** Mounts nothing until a sheet is first opened, then stays mounted so it can slide out. */
export function LazyParcelActions(props: ParcelActionsProps) {
  if (!props.sheet && actionsPromise === null) return null
  return (
    <Suspense fallback={null}>
      <Sheets {...props} />
    </Suspense>
  )
}

export function LazyRemoveVersion(props: {
  parcelId: string
  target: RemoveTarget | null
  onClose: () => void
}) {
  if (!props.target && actionsPromise === null) return null
  return (
    <Suspense fallback={null}>
      <Remove {...props} />
    </Suspense>
  )
}
