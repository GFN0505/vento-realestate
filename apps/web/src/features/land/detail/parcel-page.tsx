import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import type { ParcelDetail } from '@vento/shared'
import { ArrowLeftIcon, UploadIcon } from 'lucide-react'
import { type RefObject, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/features/shell/use-page-title'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { LAND_TITLE } from '../land-words'
import { ParcelReadOnlyBanner } from '../parcel-read-only'
import { LazyParcelSheet, preloadParcelSheet } from '../parcel-sheet-lazy'
import { parcelQuery } from '../parcels-queries'
import { updateStageLabel } from './detail-words'
import { LazyDocumentPreview, preloadPreview } from './document-preview-lazy'
import { type ParcelAbilities, parcelAbilities } from './parcel-abilities'
import { LazyParcelActions, LazyRemoveVersion, preloadParcelActions } from './parcel-actions-lazy'
import { ParcelContent } from './parcel-content'
import { ParcelHeader } from './parcel-header'
import { archiveParcel, restoreParcel } from './parcel-restore'
import { ParcelLoadError, ParcelSkeleton } from './parcel-states'
import type { RemoveTarget } from './remove-version-dialog'
import { TitleTracker } from './title-tracker'
import { useDocumentLink } from './use-document-link'
import { type ParcelAddress, useParcelAddress } from './use-parcel-address'
import { usePreviewVersion } from './use-preview-version'

const route = getRouteApi('/_app/_shell/land/$parcelId')

/**
 * A parcel (boards ParcelDetail, ParcelDetailMobile; detail archetype): header with its facts
 * and status, the title stage tracker, then documents beside the activity. Every sheet and the
 * preview are in the address, so Back closes them and a link opens the same view.
 */
export function ParcelPage() {
  const { parcelId } = route.useParams()
  const search = route.useSearch()
  const address = useParcelAddress()
  const query = useQuery(parcelQuery(parcelId))
  const parcel = query.data
  usePageTitle(parcel?.name ?? 'Parcel', { module: 'land', recent: parcel !== undefined })
  const preview = usePreviewVersion(parcel, search.preview)
  const link = useDocumentLink(parcelId)
  // The Preview button that opened the preview, so closing it lands there again.
  const previewTrigger = useRef<HTMLElement | null>(null)

  return (
    <div className="flex flex-col gap-5 pb-24 md:pb-0">
      <Link
        to="/land"
        search={(prev) => ({ entity: (prev as { entity?: string }).entity })}
        preload="intent"
        className="inline-flex w-fit items-center gap-1 rounded-sm font-semibold text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {LAND_TITLE}
      </Link>
      {query.isError && !parcel ? (
        <ParcelLoadError
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : !parcel ? (
        <ParcelSkeleton />
      ) : (
        <LoadedParcel
          parcel={parcel}
          address={address}
          link={link}
          previewTrigger={previewTrigger}
        />
      )}
      <LazyParcelSheet
        open={search.sheet === 'edit' && parcel !== undefined}
        parcel={parcel ?? null}
        onClose={address.closeSheet}
      />
      {parcel && (
        <LazyParcelActions
          parcel={parcel}
          sheet={search.sheet}
          stage={search.stage}
          documentId={search.doc}
          allowed={allowedSheets(parcelAbilities(parcel))}
          onStage={address.switchStage}
          onClose={address.closeSheet}
        />
      )}
      <LazyDocumentPreview
        version={preview}
        onClose={address.closePreview}
        onDownload={link.download}
        onOpenInTab={(id) => void link.openInTab(id)}
        returnFocus={() => previewTrigger.current}
      />
    </div>
  )
}

const allowedSheets = (a: ParcelAbilities) => ({
  stage: a.updateStage,
  stages: a.editStages,
  upload: a.upload,
})

type LoadedProps = {
  parcel: ParcelDetail
  address: ParcelAddress
  link: ReturnType<typeof useDocumentLink>
  previewTrigger: RefObject<HTMLElement | null>
}

function LoadedParcel({ parcel, address, link, previewTrigger }: LoadedProps) {
  const search = route.useSearch()
  const queryClient = useQueryClient()
  const phone = useMediaQuery(PHONE_QUERY)
  const [removing, setRemoving] = useState<RemoveTarget | null>(null)
  const [restoring, setRestoring] = useState(false)
  const abilities = parcelAbilities(parcel)
  const current = parcel.currentStage
  const updateCurrent = () => address.openSheet('stage', { stage: current?.type })
  const upload = (doc?: string) => address.openSheet('upload', { doc })

  return (
    <>
      <ParcelReadOnlyBanner parcel={parcel} />
      <ParcelHeader
        parcel={parcel}
        abilities={abilities}
        onUpdateStage={updateCurrent}
        onRestore={() => {
          setRestoring(true)
          void restoreParcel(queryClient, parcel.id).finally(() => setRestoring(false))
        }}
        restoring={restoring}
        onIntent={preloadParcelActions}
        menu={{
          upload: abilities.upload ? () => upload() : null,
          editParcel: abilities.editParcel
            ? () => {
                preloadParcelSheet()
                address.openSheet('edit')
              }
            : null,
          editStages: abilities.editStages ? () => address.openSheet('stages') : null,
          archive: abilities.archive ? () => void archiveParcel(queryClient, parcel.id) : null,
        }}
      />
      <TitleTracker
        parcel={parcel}
        onStage={abilities.updateStage ? (stage) => address.openSheet('stage', { stage }) : null}
        onEditStages={abilities.editStages ? () => address.openSheet('stages') : null}
        onIntent={preloadParcelActions}
      />
      <ParcelContent
        parcel={parcel}
        abilities={abilities}
        tab={search.tab ?? 'documents'}
        activityPage={search.page ?? 1}
        onTab={address.tab}
        onActivityPage={address.activityPage}
        handlers={{
          preview: (versionId) => {
            if (phone) return void link.openInTab(versionId)
            previewTrigger.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null
            address.openPreview(versionId)
          },
          download: (versionId) => void link.download(versionId),
          busy: link.busy,
        }}
        onUpload={upload}
        onRemove={(document, version) => {
          preloadParcelActions()
          setRemoving({ document, version })
        }}
        onIntent={() => {
          preloadParcelActions()
          if (!phone) preloadPreview()
        }}
      />
      {phone && (abilities.upload || (abilities.updateStage && current)) && (
        // Phones: the actions sit above the tabs and the home indicator (board ParcelDetailMobile).
        <div className="fixed inset-x-0 bottom-(--tabbar-height) z-30 flex gap-2 px-4 pb-2 md:hidden">
          {abilities.upload && (
            <Button variant="outline" onClick={() => upload()} className="h-11 flex-1 shadow-lg">
              <UploadIcon aria-hidden />
              Upload document
            </Button>
          )}
          {abilities.updateStage && current && (
            <Button onClick={updateCurrent} className="h-11 flex-1 shadow-lg">
              {updateStageLabel(current)}
            </Button>
          )}
        </div>
      )}
      <LazyRemoveVersion parcelId={parcel.id} target={removing} onClose={() => setRemoving(null)} />
    </>
  )
}
