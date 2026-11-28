import {
  type DocumentVersion,
  documentLabel,
  type ParcelDetail,
  type TitleDocument,
} from '@vento/shared'
import { ChevronDownIcon, FileTextIcon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { stageLabel } from '../land-words'
import { DETAIL_COPY, fileKind, versionFacts, versionLine } from './detail-words'
import { DocumentActions, type VaultHandlers } from './document-actions'
import { DocumentVersions } from './document-versions'
import type { ParcelAbilities } from './parcel-abilities'

export type VaultProps = {
  parcel: ParcelDetail
  abilities: ParcelAbilities
  handlers: VaultHandlers
  /** Upload document, or (with a document) its next version. */
  onUpload: (documentId?: string) => void
  onRemove: (document: TitleDocument, version: DocumentVersion) => void
  onIntent: () => void
}

/*
 * The table needs ~770 px: sized by the card, not the screen (container queries), since the
 * activity column beside it leaves the card narrow on laptops. Narrower cards get phone rows.
 */
const GRID =
  '@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_11rem] @3xl:items-center @3xl:gap-4'

/**
 * The document vault (board ParcelDetail, documents tab): one row per document, by type in
 * catalog order. A row shows its latest version ("v2 · 2 earlier"); the version button opens
 * the history with Preview, Download, Remove and Upload new version.
 */
export function DocumentVault({
  parcel,
  abilities,
  handlers,
  onUpload,
  onRemove,
  onIntent,
}: VaultProps) {
  const docs = parcel.documents.filter((d) => d.latest)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FileTextIcon aria-hidden className="size-5" strokeWidth={1.7} />
        </span>
        <p className="max-w-sm text-pretty text-[13.5px] text-muted-foreground leading-relaxed">
          {abilities.upload ? DETAIL_COPY.vaultEmpty : DETAIL_COPY.vaultEmptyReadOnly}
        </p>
        {abilities.upload && (
          <Button onClick={() => onUpload()} onPointerEnter={onIntent} className="max-md:h-11">
            <UploadIcon aria-hidden />
            {DETAIL_COPY.uploadDocument}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="@container flex flex-col">
      <div
        aria-hidden
        className={cn(
          GRID,
          'hidden border-b bg-muted/40 px-4 py-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide sm:px-5',
        )}
      >
        <span>Document</span>
        <span>Version</span>
        <span>Updated</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul aria-label={DETAIL_COPY.documents} className="flex flex-col">
        {docs.map((doc) => (
          <VaultRow
            key={doc.id}
            doc={doc}
            open={open.has(doc.id)}
            onToggle={() => toggle(doc.id)}
            abilities={abilities}
            handlers={handlers}
            onUpload={() => onUpload(doc.id)}
            onRemove={(version) => onRemove(doc, version)}
            onIntent={onIntent}
          />
        ))}
      </ul>
      {abilities.upload && (
        <p className="border-t px-4 py-3 text-muted-foreground text-xs sm:px-5">
          {DETAIL_COPY.vaultHint}
        </p>
      )}
    </div>
  )
}

type RowProps = {
  doc: TitleDocument
  open: boolean
  onToggle: () => void
  abilities: ParcelAbilities
  handlers: VaultHandlers
  onUpload: () => void
  onRemove: (version: DocumentVersion) => void
  onIntent: () => void
}

function VaultRow({
  doc,
  open,
  onToggle,
  abilities,
  handlers,
  onUpload,
  onRemove,
  onIntent,
}: RowProps) {
  const latest = doc.latest
  if (!latest) return null
  const label = documentLabel(doc.type, doc.name)
  const panelId = `versions-${doc.id}`
  // A named paper filed under a stage ("Query letter") says which; a stage's own document doesn't.
  const under = doc.type === 'other' && doc.stageType ? stageLabel(doc.stageType) : null
  const facts = [under, versionFacts(latest, { size: false })].filter(Boolean).join(' · ')

  return (
    <li className="border-b last:border-b-0">
      <div className={cn(GRID, 'flex items-center gap-3 px-4 py-3 sm:px-5')}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted font-bold text-[11px] text-foreground"
          >
            {fileKind(latest.file.contentType)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className="line-clamp-2 font-semibold text-[13px] [overflow-wrap:anywhere]"
              title={label}
            >
              {label}
            </span>
            <span className="truncate text-muted-foreground text-xs tabular-nums">
              <span className="@3xl:hidden">
                {versionLine(doc)} · {formatDate(latest.uploadedAt)}
                {facts && ' · '}
              </span>
              {facts}
            </span>
          </span>
        </div>
        <span className="hidden @3xl:block">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${versionLine(doc)}. Versions of ${label}`}
            onClick={onToggle}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 font-semibold text-[13px] tabular-nums outline-hidden hover:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
          >
            {versionLine(doc)}
            <ChevronDownIcon
              aria-hidden
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </button>
        </span>
        <span className="hidden min-w-0 flex-col text-xs tabular-nums @3xl:flex">
          <span>{formatDate(latest.uploadedAt)}</span>
          <span className="truncate text-muted-foreground">{latest.uploadedBy.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 @3xl:justify-end">
          <DocumentActions
            version={latest}
            label={`${label} v${latest.versionNo}`}
            handlers={handlers}
          />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`Versions of ${label}`}
            onClick={onToggle}
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring @3xl:hidden"
          >
            <ChevronDownIcon
              aria-hidden
              className={cn(
                'size-4 transition-transform motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </button>
        </span>
      </div>
      {open && (
        <div id={panelId} className="border-t bg-muted/30 px-4 py-2 sm:px-5">
          <DocumentVersions
            doc={doc}
            abilities={abilities}
            handlers={handlers}
            onUpload={onUpload}
            onRemove={onRemove}
            onIntent={onIntent}
          />
        </div>
      )}
    </li>
  )
}
