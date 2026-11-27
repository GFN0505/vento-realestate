import { acceptFor, FILE_KINDS, FILE_PURPOSES, formatFileSize } from '@vento/shared'
import { CameraIcon, UploadIcon } from 'lucide-react'
import { type ChangeEvent, type DragEvent, type ReactNode, useId, useRef, useState } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { checkFile } from '@/lib/upload/upload-error'
import type { UploadItem } from '@/lib/upload/upload-item'
import type { FileUploads } from '@/lib/upload/use-file-upload'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { FileRow } from './file-drop-row'
import { useUploadAnnouncement } from './use-upload-announcement'

export type FileDropProps = {
  /** From `useFileUpload`; the form reads `done` and `pendingCount` from the same object. */
  uploads: FileUploads
  /** The zone's main line, e.g. "Drop PDFs or photos here". */
  title?: string
  /** Under the title; defaults to the purpose's size limit. */
  hint?: ReactNode
  /** One file: a new pick replaces the current file once it has uploaded. */
  multiple?: boolean
  /** Offers **Take photo** (the back camera) on phones and tablets. */
  takePhoto?: boolean
  /** A first guess for each file from its name, kept on the row as `guess`. */
  guessType?: (name: string) => string | null
  /** Extra controls under a file, e.g. a document-type picker. */
  renderFile?: (item: UploadItem) => ReactNode
  disabled?: boolean
  className?: string
}

/** Text or a link dragged over the page isn't a file: no highlight, nothing to drop. */
const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')

/** A file input dressed as an outline button: the input itself takes focus and the keyboard. */
const pickerClass = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'relative cursor-pointer max-md:h-11 max-md:px-4 max-md:text-[13px]',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid',
  'has-[:disabled]:pointer-events-none has-[:disabled]:opacity-60',
)

export function FileDrop({
  uploads,
  title = 'Drop files here',
  hint,
  multiple = true,
  takePhoto = false,
  guessType,
  renderFile,
  disabled = false,
  className,
}: FileDropProps) {
  const [dragging, setDragging] = useState(false)
  const chooser = useRef<HTMLInputElement>(null)
  const coarse = useMediaQuery('(pointer: coarse)')
  const def = FILE_PURPOSES[uploads.purpose]
  const photoTypes = def.kinds.filter((k) => k !== 'pdf').map((k) => FILE_KINDS[k].contentType)
  const [refused, setRefused] = useState<string | null>(null)
  const refusedId = useId()
  const announcement = useUploadAnnouncement(uploads.items)

  function take(list: FileList | null) {
    const files = [...(list ?? [])]
    const [file] = files
    if (disabled || !file) return
    if (multiple) return uploads.add(files, { guessType })
    // One file: a refused pick never costs the file already here.
    const checked = checkFile(uploads.purpose, file)
    setRefused(checked.ok ? null : `${file.name} wasn't added. ${checked.problem}`)
    if (checked.ok) uploads.add([file], { guessType, replace: true })
  }

  function picked(event: ChangeEvent<HTMLInputElement>) {
    take(event.currentTarget.files)
    // So choosing the same file again (after removing it) still fires a change.
    event.currentTarget.value = ''
  }

  function removed(key: string) {
    uploads.remove(key)
    setRefused(null)
    chooser.current?.focus()
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target for a mouse; the buttons inside are the accessible way in. */}
      <div
        data-dragging={dragging || undefined}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          setDragging(!disabled)
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault()
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          take(e.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-border border-dashed bg-muted/60 px-4 py-6 text-center transition-colors duration-150 motion-reduce:transition-none sm:px-6',
          'data-[dragging]:border-selected-border data-[dragging]:bg-selected',
          disabled && 'opacity-60',
        )}
      >
        <UploadIcon aria-hidden className="mb-1 size-5 text-muted-foreground" strokeWidth={1.8} />
        <p className="font-semibold text-[13px] text-foreground">{title}</p>
        <p className="text-muted-foreground text-xs">
          {hint ?? `Up to ${formatFileSize(def.maxBytes)}.`}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <label className={pickerClass}>
            <input
              ref={chooser}
              type="file"
              className="sr-only"
              accept={acceptFor(uploads.purpose)}
              multiple={multiple}
              disabled={disabled}
              aria-describedby={refused ? refusedId : undefined}
              onChange={picked}
            />
            {multiple ? 'Choose files' : 'Choose file'}
          </label>
          {takePhoto && coarse && photoTypes.length > 0 && (
            <label className={pickerClass}>
              <input
                type="file"
                className="sr-only"
                accept={photoTypes.join(',')}
                capture="environment"
                disabled={disabled}
                onChange={picked}
              />
              <CameraIcon aria-hidden />
              Take photo
            </label>
          )}
        </div>
      </div>
      {refused && (
        <p id={refusedId} role="alert" className="text-destructive text-xs leading-snug">
          {refused}
        </p>
      )}
      {uploads.items.length > 0 && (
        <ul aria-label="Files" className="flex flex-col gap-2">
          {uploads.items.map((item) => (
            <FileRow
              key={item.key}
              item={item}
              onRetry={() => uploads.retry(item.key)}
              onRemove={() => removed(item.key)}
            >
              {renderFile?.(item)}
            </FileRow>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
