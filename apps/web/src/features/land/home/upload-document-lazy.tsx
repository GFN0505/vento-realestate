import { lazy, Suspense } from 'react'
import type { UploadDocumentSheetProps } from './upload-document-sheet'

/*
 * Upload document lives in its own chunk (the upload code and the file picker), downloaded when
 * someone heads for the button, never with Home itself.
 */

let sheetPromise: Promise<typeof import('./upload-document-sheet')> | null = null

/** A failed download (offline) is forgotten, so the next attempt refetches. */
function loadSheet() {
  sheetPromise ??= import('./upload-document-sheet').catch((error: unknown) => {
    sheetPromise = null
    throw error
  })
  return sheetPromise
}

/** Starts the download on touch, hover or focus of Upload document. */
export function preloadUploadDocument(): void {
  loadSheet().catch(() => {
    // Offline: opening the sheet tries again.
  })
}

const Sheet = lazy(() => loadSheet().then((m) => ({ default: m.UploadDocumentSheet })))

/** Mounts nothing until first opened, then stays mounted so it can slide out. */
export function LazyUploadDocumentSheet(props: UploadDocumentSheetProps) {
  if (!props.open && sheetPromise === null) return null
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  )
}
