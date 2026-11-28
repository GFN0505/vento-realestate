import type { ComponentProps } from 'react'
import { lazy, Suspense } from 'react'
import type { DocumentPreview } from './document-preview'

let previewPromise: Promise<typeof import('./document-preview')> | null = null

function loadPreview() {
  previewPromise ??= import('./document-preview').catch((error: unknown) => {
    previewPromise = null
    throw error
  })
  return previewPromise
}

/** Starts the download on hover or focus of a Preview button. */
export function preloadPreview(): void {
  loadPreview().catch(() => {
    // Offline: opening the preview tries again.
  })
}

const Preview = lazy(() => loadPreview().then((m) => ({ default: m.DocumentPreview })))

type Props = ComponentProps<typeof DocumentPreview>

/** The preview dialog's chunk loads the first time a preview opens (plan §8: lazy). */
export function LazyDocumentPreview(props: Props) {
  if (!props.version && previewPromise === null) return null
  return (
    <Suspense fallback={null}>
      <Preview {...props} />
    </Suspense>
  )
}
