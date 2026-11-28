import { useQuery } from '@tanstack/react-query'
import { type DocumentVersion, documentLabel, type TitleDocument } from '@vento/shared'
import { UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { documentVersionsQuery } from '../parcels-queries'
import { DETAIL_COPY, versionFacts } from './detail-words'
import { DocumentActions, type VaultHandlers } from './document-actions'
import type { ParcelAbilities } from './parcel-abilities'

type Props = {
  doc: TitleDocument
  abilities: ParcelAbilities
  handlers: VaultHandlers
  onUpload: () => void
  onRemove: (version: DocumentVersion) => void
  onIntent: () => void
}

/**
 * Every version of one document, newest first. Removed versions stay listed, muted, with who
 * removed them and why (spec: nothing is deleted); only people who can remove documents may
 * still download their file.
 */
export function DocumentVersions({
  doc,
  abilities,
  handlers,
  onUpload,
  onRemove,
  onIntent,
}: Props) {
  const versions = useQuery(documentVersionsQuery(doc.id))
  const label = documentLabel(doc.type, doc.name)

  return (
    <div className="flex flex-col">
      {versions.isError && !versions.data ? (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-x-3 py-2 text-[13px] text-muted-foreground"
        >
          {DETAIL_COPY.versionsError}
          <Button
            variant="link"
            onClick={() => void versions.refetch()}
            disabled={versions.isFetching}
            className="text-[13px] max-md:min-h-11"
          >
            Try again
          </Button>
        </p>
      ) : !versions.data ? (
        <div aria-hidden className="flex flex-col gap-2 py-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <ol aria-label={`Versions of ${label}`} className="flex flex-col">
          {versions.data.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              label={`${label} v${version.versionNo}`}
              abilities={abilities}
              handlers={handlers}
              onRemove={() => onRemove(version)}
            />
          ))}
        </ol>
      )}
      {abilities.upload && (
        <div className="py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onUpload}
            onPointerEnter={onIntent}
            className="-ml-2 text-link hover:text-link-hover max-md:h-11"
          >
            <UploadIcon aria-hidden />
            Upload new version
          </Button>
        </div>
      )}
    </div>
  )
}

type RowProps = {
  version: DocumentVersion
  label: string
  abilities: ParcelAbilities
  handlers: VaultHandlers
  onRemove: () => void
}

function VersionRow({ version, label, abilities, handlers, onRemove }: RowProps) {
  const removed = version.removed
  const facts = versionFacts(version)
  const canRemove = abilities.removeVersion && !removed
  // A removed file still opens for people who can remove documents (the server checks).
  const canOpen = !removed || abilities.removeVersion

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0">
      <span className="w-7 shrink-0 font-semibold text-[13px] tabular-nums">
        v{version.versionNo}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] tabular-nums">
          {formatDate(version.uploadedAt)} · {version.uploadedBy.name}
        </span>
        {(facts || version.note) && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {[version.note, facts].filter(Boolean).join(' · ')}
          </span>
        )}
        {removed && (
          <span className="text-status-rose-fg text-xs">
            Removed {formatDate(removed.at)} by {removed.byName} · {removed.reason}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1">
        {canOpen && (
          <DocumentActions
            version={version}
            label={label}
            handlers={handlers}
            downloadOnly={removed !== null}
          />
        )}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="text-destructive hover:text-destructive max-md:h-11"
          >
            Remove
          </Button>
        )}
      </span>
    </li>
  )
}
