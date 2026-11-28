import { declaredKind, formatFileSize } from '@vento/shared'
import { CheckIcon, FileTextIcon, ImageIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { UploadItem, UploadStatus } from '@/lib/upload/upload-item'
import { cn } from '@/lib/utils'
import { UPLOAD_PAUSED } from './use-upload-announcement'

type RowProps = { item: UploadItem; onRetry(): void; onRemove(): void; children?: ReactNode }

/** One file under the drop zone: name, size, status line, a thin progress bar while it's going. */
export function FileRow({ item, onRetry, onRemove, children }: RowProps) {
  const Icon = declaredKind(item.name, item.file.type) === 'pdf' ? FileTextIcon : ImageIcon
  const pending = item.status !== 'done' && item.status !== 'failed'
  const percent = item.size > 0 ? Math.round((item.loaded / item.size) * 100) : 0
  return (
    <li className="relative flex items-start gap-3 overflow-hidden rounded-[10px] border bg-card p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate font-medium text-sm" title={item.name}>
            {item.name}
          </p>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {formatFileSize(item.size)}
          </span>
        </div>
        <RowStatus item={item} percent={percent} />
        {item.status === 'failed' && item.canRetry && (
          <Button variant="outline" size="sm" className="mt-2 max-md:h-11" onClick={onRetry}>
            Try again
          </Button>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-my-0.5 -mr-1 size-9 text-muted-foreground hover:text-foreground max-md:size-11"
        aria-label={`Remove ${item.name}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
      {pending && (
        <div
          role="progressbar"
          aria-label={`Uploading ${item.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="absolute inset-x-0 bottom-0 h-[3px] bg-muted"
        >
          <div
            className={cn(
              'h-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
              item.status === 'paused' ? 'bg-status-amber' : 'bg-primary',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </li>
  )
}

export const STATUS_LINE: Record<
  Exclude<UploadStatus, 'failed' | 'done'>,
  (percent: number) => string
> = {
  checking: () => 'Checking…',
  uploading: (percent) => `Uploading… ${percent}%`,
  paused: () => UPLOAD_PAUSED,
}

export function RowStatus({ item, percent }: { item: UploadItem; percent: number }) {
  if (item.status === 'done') {
    return (
      <p className="mt-1 flex items-center gap-1 text-status-emerald-fg text-xs">
        <CheckIcon aria-hidden className="size-3.5" strokeWidth={2.4} />
        Uploaded
      </p>
    )
  }
  if (item.status === 'failed') {
    return <p className="mt-1 text-destructive text-xs leading-snug">{item.error}</p>
  }
  return (
    <p
      className={cn(
        'mt-1 text-xs tabular-nums leading-snug',
        item.status === 'paused' ? 'text-status-amber-fg' : 'text-muted-foreground',
      )}
    >
      {STATUS_LINE[item.status](percent)}
    </p>
  )
}
