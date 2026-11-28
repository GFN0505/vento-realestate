import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { CloudOffIcon, FileUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { landHomeQuery } from '@/features/land/parcels-queries'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { HomeQueue, HomeQueueSkeleton } from '@/features/shell/home-queue'
import { todayInLagos } from '@/lib/format'
import { useOverlayHistory } from '@/lib/overlay-history'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { LAND_HOME_COPY } from './land-home-words'
import { landQueueRows } from './land-queue'
import { TitlePipelinePanel, TitlePipelineSkeleton } from './title-pipeline-panel'
import { LazyUploadDocumentSheet, preloadUploadDocument } from './upload-document-lazy'
import { useHomeEntityId } from './use-home-entity'

const route = getRouteApi('/_app/_shell/')

/**
 * The Land & legal home's work (board HomeLand, HomeLandMobile): the queue for those who can
 * update stages, the Title pipeline, and on phones a sticky **Upload document**. Follows the
 * top bar's company, like the tile above it.
 */
export function LandHomeSection() {
  const entityId = useHomeEntityId()
  const { permissions } = useEffectiveAccess()
  const canEdit = can(permissions, 'land', 'edit')
  const canUpload = can(permissions, 'land', 'create')
  const home = useQuery(landHomeQuery(entityId))
  const sheet = route.useSearch({ select: (s) => s.sheet })
  const navigate = route.useNavigate()
  const data = home.data

  const overlay = useOverlayHistory()
  const setSheet = (open: boolean) => {
    const go = () =>
      navigate({
        search: (prev) => ({ ...prev, sheet: open ? 'upload' : undefined }),
        replace: !open,
      })
    if (open) overlay.opened(go())
    else overlay.close(() => void go())
  }

  return (
    <>
      {home.isError && !data ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:p-5">
          <CloudOffIcon aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
          <p className="flex-1">{LAND_HOME_COPY.loadError}</p>
          <Button
            variant="outline"
            onClick={() => void home.refetch()}
            disabled={home.isFetching}
            className="max-md:h-11"
          >
            Try again
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'grid items-start gap-5',
            canEdit ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'lg:grid-cols-2',
          )}
        >
          {canEdit &&
            (data ? (
              <HomeQueue
                items={landQueueRows(data.queue, todayInLagos())}
                renderLink={(row, props) => (
                  <Link
                    to="/land/$parcelId"
                    params={{ parcelId: row.parcelId }}
                    search={{ sheet: 'stage', stage: row.stageType }}
                    preload="intent"
                    {...props}
                  />
                )}
              />
            ) : (
              <HomeQueueSkeleton />
            ))}
          {data ? (
            <TitlePipelinePanel
              pipeline={data.pipeline}
              titledCount={data.titledCount}
              hasParcels={data.hasParcels}
            />
          ) : (
            <TitlePipelineSkeleton />
          )}
        </div>
      )}
      {canUpload && (
        <div className="fixed inset-x-0 bottom-(--tabbar-height) z-30 px-4 pb-2 md:hidden">
          <Button
            onPointerDown={preloadUploadDocument}
            onFocus={preloadUploadDocument}
            onClick={() => setSheet(true)}
            className="h-11 w-full shadow-lg"
          >
            <FileUpIcon aria-hidden />
            {LAND_HOME_COPY.uploadDocument}
          </Button>
        </div>
      )}
      <LazyUploadDocumentSheet
        open={canUpload && sheet === 'upload'}
        onClose={() => setSheet(false)}
        entityId={entityId}
      />
    </>
  )
}
