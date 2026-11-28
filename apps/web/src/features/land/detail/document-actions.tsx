import type { DocumentVersion } from '@vento/shared'
import { DownloadIcon, EyeIcon, LoaderCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canPreview } from './detail-words'

export type VaultHandlers = {
  /** Desktop: the preview dialog; phones: the browser's own viewer in a new tab. */
  preview: (versionId: string) => void
  download: (versionId: string) => void
  /** "versionId:inline" or "versionId:attachment" while its link is being fetched. */
  busy: string | null
}

type Props = {
  version: Pick<DocumentVersion, 'id' | 'file'>
  /** "C of O v2", for the buttons' names. */
  label: string
  handlers: VaultHandlers
  /** Only Download (a removed version's file, for people who can remove documents). */
  downloadOnly?: boolean
}

/**
 * Preview and Download for one version. HEIC photos download (most browsers can't show them).
 * Icon-only (44 px) when the vault card is narrow; named for screen readers either way. Lives
 * inside the vault's `@container`.
 */
export function DocumentActions({ version, label, handlers, downloadOnly = false }: Props) {
  const previewable = !downloadOnly && canPreview(version.file.contentType)
  const loading = (kind: string) => handlers.busy === `${version.id}:${kind}`
  return (
    <span className="flex shrink-0 items-center gap-1">
      {previewable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlers.preview(version.id)}
          aria-label={`Preview ${label}`}
          className="text-link hover:text-link-hover @max-3xl:size-11 @max-3xl:px-0"
        >
          {loading('inline') ? (
            <LoaderCircleIcon aria-hidden className="animate-spin" />
          ) : (
            <EyeIcon aria-hidden className="@3xl:hidden" />
          )}
          <span className="@max-3xl:hidden">Preview</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handlers.download(version.id)}
        disabled={loading('attachment')}
        aria-label={`Download ${label}`}
        className="text-link hover:text-link-hover @max-3xl:size-11 @max-3xl:px-0"
      >
        {loading('attachment') ? (
          <LoaderCircleIcon aria-hidden className="animate-spin" />
        ) : (
          <DownloadIcon aria-hidden className="@3xl:hidden" />
        )}
        <span className="@max-3xl:hidden">Download</span>
      </Button>
    </span>
  )
}
