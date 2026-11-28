import { UploadIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { DETAIL_COPY } from './detail-words'
import { DocumentVault, type VaultProps } from './document-vault'
import { ParcelActivity } from './parcel-activity'
import type { ParcelTab } from './parcel-search'

/** From here the activity sits beside the documents (board ParcelDetail); below, it's a tab. */
const WIDE_QUERY = '(min-width: 1024px)'

type Props = VaultProps & {
  tab: ParcelTab
  activityPage: number
  onTab: (tab: ParcelTab) => void
  onActivityPage: (page: number) => void
}

const TABS: readonly ParcelTab[] = ['documents', 'activity']

/**
 * Documents and Activity. Wide screens show both (activity on the right, as the detail
 * archetype); narrower ones make them tabs, held in the address (`?tab=activity`).
 */
export function ParcelContent({ tab, activityPage, onTab, onActivityPage, ...vault }: Props) {
  const wide = useMediaQuery(WIDE_QUERY)
  const count = vault.parcel.documents.filter((d) => d.latest).length
  const showing: ParcelTab = wide ? 'documents' : tab
  const label = (t: ParcelTab) =>
    t === 'documents' ? `${DETAIL_COPY.documents} · ${count}` : DETAIL_COPY.activity

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const next = tab === 'documents' ? 'activity' : 'documents'
    onTab(next)
    document.getElementById(`parcel-tab-${next}`)?.focus()
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <section
        aria-labelledby={wide ? 'parcel-documents-heading' : undefined}
        className="min-w-0 overflow-hidden rounded-[10px] border bg-card"
      >
        {wide ? (
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
            <h2
              id="parcel-documents-heading"
              className="font-heading font-semibold text-[15px] tabular-nums"
            >
              {label('documents')}
            </h2>
            {vault.abilities.upload && count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => vault.onUpload()}
                onPointerEnter={vault.onIntent}
                className="text-link hover:text-link-hover"
              >
                <UploadIcon aria-hidden />
                {DETAIL_COPY.uploadDocument}
              </Button>
            )}
          </div>
        ) : (
          <div
            role="tablist"
            aria-label="Parcel"
            onKeyDown={onKeyDown}
            className="flex gap-1 border-b px-3"
          >
            {TABS.map((t) => (
              <button
                key={t}
                id={`parcel-tab-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls="parcel-tab-panel"
                tabIndex={tab === t ? 0 : -1}
                onClick={() => onTab(t)}
                className={cn(
                  'min-h-11 border-b-2 px-2.5 font-semibold text-[13px] tabular-nums outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  tab === t
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label(t)}
              </button>
            ))}
          </div>
        )}
        {wide ? (
          <DocumentVault {...vault} />
        ) : (
          <div id="parcel-tab-panel" role="tabpanel" aria-labelledby={`parcel-tab-${showing}`}>
            {showing === 'documents' ? (
              <DocumentVault {...vault} />
            ) : (
              <div className="px-4 py-4">
                <ParcelActivity
                  parcelId={vault.parcel.id}
                  page={activityPage}
                  onPage={onActivityPage}
                />
              </div>
            )}
          </div>
        )}
      </section>
      {wide && (
        <aside
          aria-labelledby="parcel-activity-heading"
          className="min-w-0 rounded-[10px] border bg-card px-5 py-4"
        >
          <h2
            id="parcel-activity-heading"
            className="mb-3.5 font-heading font-semibold text-[15px]"
          >
            {DETAIL_COPY.activity}
          </h2>
          <ParcelActivity parcelId={vault.parcel.id} page={activityPage} onPage={onActivityPage} />
        </aside>
      )}
    </div>
  )
}
