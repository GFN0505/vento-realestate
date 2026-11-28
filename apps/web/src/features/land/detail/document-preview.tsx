import { useMutation } from '@tanstack/react-query'
import { CloudOffIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchDocumentLink, linkErrorText } from './use-document-link'

export type PreviewVersion = {
  id: string
  /** "C of O v2". */
  label: string
  /** "Uploaded 2 Sep 2025 by Ngozi Adeyemi". */
  meta: string | null
  contentType: string | null
}

type Props = {
  /** null: closed. */
  version: PreviewVersion | null
  onClose: () => void
  onDownload: (versionId: string) => void
  /** Fetches its own fresh link: the one on screen may have run out. */
  onOpenInTab: (versionId: string) => void
  /** The Preview button that opened it: focus goes back there on closing. */
  returnFocus?: () => HTMLElement | null
}

/**
 * Preview (desktop; its own chunk): a PDF in the browser's own viewer inside a frame, a photo
 * as an image. The 5-minute link is fetched on opening and never kept after closing.
 */
export function DocumentPreview({ version, onClose, onDownload, onOpenInTab, returnFocus }: Props) {
  // Keep the last version on screen while the dialog fades out.
  const [shown, setShown] = useState(version)
  if (version && version.id !== shown?.id) setShown(version)
  const link = useMutation({ mutationFn: (id: string) => fetchDocumentLink(id, 'inline') })
  const { mutate, reset } = link
  const id = version?.id

  useEffect(() => {
    if (id) mutate(id)
    else reset()
  }, [id, mutate, reset])

  const url = link.data?.url
  const image = shown?.contentType?.startsWith('image/') ?? false

  return (
    <Dialog open={version !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          const back = returnFocus?.()
          if (!back?.isConnected) return
          event.preventDefault()
          back.focus()
        }}
        className="top-6 flex h-[calc(100dvh-3rem)] max-w-[min(1040px,calc(100vw-3rem))] flex-col gap-0"
      >
        <DialogHeader className="flex-row items-center gap-3 pr-14">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle className="truncate text-[15px]">{shown?.label}</DialogTitle>
            <DialogDescription className="truncate">{shown?.meta ?? 'Preview'}</DialogDescription>
          </div>
          {url && shown && (
            <Button variant="ghost" size="sm" onClick={() => onOpenInTab(shown.id)}>
              <ExternalLinkIcon aria-hidden />
              Open in new tab
            </Button>
          )}
          {shown && (
            <Button variant="outline" size="sm" onClick={() => onDownload(shown.id)}>
              <DownloadIcon aria-hidden />
              Download
            </Button>
          )}
        </DialogHeader>
        <div className="relative min-h-0 flex-1 bg-muted/50">
          {link.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <CloudOffIcon aria-hidden className="size-6 text-muted-foreground" />
              <p role="alert" className="max-w-sm text-[13.5px] text-muted-foreground">
                {linkErrorText(link.error)}
              </p>
              {shown && (
                <Button variant="outline" onClick={() => mutate(shown.id)}>
                  Try again
                </Button>
              )}
            </div>
          ) : !url ? (
            <Skeleton aria-label="Loading the document" className="absolute inset-6 rounded-md" />
          ) : image ? (
            <img
              src={url}
              alt={shown?.label ?? 'Document'}
              className="h-full w-full object-contain p-4"
            />
          ) : (
            <iframe
              src={url}
              title={shown?.label ?? 'Document'}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
