import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { PAGE_SHORTCUT_EVENT } from '@/features/shell/shortcuts'
import { usePageTitle } from '@/features/shell/use-page-title'
import { TeamPagination } from '@/features/team/team-pagination'
import { useOverlayHistory } from '@/lib/overlay-history'
import { can } from '@/lib/permissions'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { LAND_TITLE, parcelsSummaryLine } from './land-words'
import { LazyParcelSheet } from './parcel-sheet-lazy'
import { ParcelsCards } from './parcels-cards'
import { parcelsListQuery } from './parcels-queries'
import { isFiltered, nextSort, PARCELS_PAGE_SIZE, type ParcelsSearch } from './parcels-search'
import { AddParcelButton, ParcelsEmpty, ParcelsError, ParcelsSkeleton } from './parcels-states'
import { ParcelsTable } from './parcels-table'
import { ParcelsToolbar } from './parcels-toolbar'

const route = getRouteApi('/_app/_shell/land/')

/**
 * Land & title (boards LandTitle, LandTitleMobile; list archetype): every parcel the viewer's
 * companies hold, with where its title stands. Follows the company switcher (decision 0014).
 */
export function ParcelsPage() {
  usePageTitle(LAND_TITLE, { module: 'land' })
  const access = useEffectiveAccess()
  const phone = useMediaQuery(PHONE_QUERY)
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const entity = useCurrentEntity()
  const list = useQuery(parcelsListQuery(search))
  const data = list.data
  const canAdd = can(access.permissions, 'land', 'create')
  const scoped = entity.entity && !entity.locked ? entity.entity : null

  const overlay = useOverlayHistory()
  const go = (patch: Partial<ParcelsSearch>, options?: { replace?: boolean }) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: options?.replace })
  const update = (patch: Partial<ParcelsSearch>, options?: { replace?: boolean }) =>
    void go(patch, options)
  const add = () => overlay.opened(go({ sheet: 'add' }))
  useAddShortcut(canAdd, add)

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <PageHeader
        title={LAND_TITLE}
        description={
          data ? (
            parcelsSummaryLine(data.summary)
          ) : list.isError ? null : (
            <Skeleton aria-hidden className="inline-block h-3.5 w-36 align-middle" />
          )
        }
        actions={canAdd && <AddParcelButton onClick={add} />}
        className="[&>div:last-child]:max-md:hidden"
      />
      <ParcelsToolbar search={search} update={update} />
      {scoped && (
        <p className="-mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          <span>
            Parcels in <span className="font-medium text-foreground">{scoped.name}</span>
          </span>
          <button
            type="button"
            onClick={() => entity.select(null)}
            className="rounded-sm font-semibold text-link underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
          >
            Show all companies
          </button>
        </p>
      )}
      <div
        aria-busy={list.isFetching || undefined}
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-150',
          list.isPlaceholderData && list.isFetching && 'opacity-60',
        )}
      >
        {list.isError && !data ? (
          <ParcelsError onRetry={() => void list.refetch()} retrying={list.isFetching} />
        ) : !data ? (
          <ParcelsSkeleton phone={phone} />
        ) : data.items.length === 0 ? (
          <ParcelsEmpty
            filtered={isFiltered(search)}
            archivedOnly={search.filter === 'archived' && !search.q}
            companyName={scoped?.name ?? null}
            onClear={() => update({ q: undefined, filter: undefined, page: undefined })}
            onAllCompanies={() => entity.select(null)}
            onAdd={canAdd ? add : null}
          />
        ) : phone ? (
          <ParcelsCards rows={data.items} />
        ) : (
          <ParcelsTable
            rows={data.items}
            search={search}
            onSort={(column) => update(nextSort(search, column), { replace: true })}
          />
        )}
        {data && (
          <TeamPagination
            page={search.page ?? 1}
            pageSize={PARCELS_PAGE_SIZE}
            total={data.total}
            onPage={(page) => update({ page: page > 1 ? page : undefined })}
          />
        )}
      </div>
      {canAdd && phone && (
        // Phones: the primary action sits above the tabs and the home indicator.
        <div className="fixed inset-x-0 bottom-(--tabbar-height) z-30 px-4 pb-2 md:hidden">
          <AddParcelButton onClick={add} className="w-full shadow-lg" />
        </div>
      )}
      <LazyParcelSheet
        open={canAdd && search.sheet === 'add'}
        parcel={null}
        onClose={() => overlay.close(() => update({ sheet: undefined }, { replace: true }))}
        onSaved={(parcel) =>
          // The new parcel opens with its tracker; Back returns to the list, not the sheet.
          void navigate({
            to: '/land/$parcelId',
            params: { parcelId: parcel.id },
            search: (prev) => ({ entity: prev.entity }),
            replace: true,
          })
        }
      />
    </div>
  )
}

/** `n` opens Add parcel, on this page only (listed under `?`). */
function useAddShortcut(enabled: boolean, add: () => void) {
  const latest = useRef(add)
  latest.current = add
  useEffect(() => {
    if (!enabled) return
    function onShortcut(event: Event) {
      if ((event as CustomEvent<string>).detail === 'land-add') latest.current()
    }
    window.addEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
    return () => window.removeEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
  }, [enabled])
}
