import { useQuery } from '@tanstack/react-query'
import { useRouter, useRouterState } from '@tanstack/react-router'
import {
  FileUpIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MapPinIcon,
  MapPinPlusIcon,
} from 'lucide-react'
import { CommandGroup, CommandHint, CommandItem } from '@/components/ui/command'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { canViewModule } from '@/features/shell/nav'
import { can } from '@/lib/permissions'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { hectaresText, placeName } from './land-words'
import { parcelSearchQuery } from './parcels-queries'

/** ⌘K's server search waits for typing to pause and for at least this much text. */
const SEARCH_DEBOUNCE_MS = 200
const MIN_SEARCH = 2

type Props = { search: string; close: () => void }

const entityOf = (search: unknown) => (search as { entity?: string }).entity

/** The parcel page's id when that's where ⌘K was opened. */
function useParcelPageId(): string | undefined {
  return useRouterState({
    select: (state) =>
      state.matches.find((m) => m.routeId === '/_app/_shell/land/$parcelId')?.params.parcelId,
  })
}

/**
 * Land & title in ⌘K (spec): **New parcel** and **Upload document** for people who can add
 * them, **Update title stage** on a parcel's page, and a Parcels group the server searches by
 * name, area, LGA or reference ("P-0012", "p12"), within the switcher's company. While the
 * next answer is on its way the old rows stay, dimmed, under "Searching parcels…".
 */
export function ParcelCommands({ search, close }: Props) {
  const access = useEffectiveAccess()
  const router = useRouter()
  const entity = useCurrentEntity()
  const viewable = canViewModule(access, 'land')
  const canAdd = viewable && can(access.permissions, 'land', 'create')
  const canUpdate = viewable && can(access.permissions, 'land', 'edit')
  const parcelId = useParcelPageId()
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const enabled = viewable && q.length >= MIN_SEARCH
  const entityId = entity.entity && !entity.locked ? entity.entity.id : undefined
  const results = useQuery({ ...parcelSearchQuery(q, entityId), enabled })
  // Shown only while the box still asks for something; a cleared box drops the old results.
  const asking = enabled && search.trim().length >= MIN_SEARCH
  const parcels = asking ? (results.data?.items ?? []) : []
  // The rows answer an earlier search: typing hasn't paused yet, or the new answer is coming.
  const searching =
    asking && (q !== search.trim() || (results.isFetching && results.isPlaceholderData))
  const go = (fn: () => void) => () => {
    close()
    fn()
  }

  return (
    <>
      {(canAdd || (canUpdate && parcelId)) && (
        <CommandGroup heading="Land & title">
          {canAdd && (
            <CommandItem
              value="parcel:new"
              keywords={['New parcel', 'add parcel land plot title register']}
              onSelect={go(() => void router.navigate({ to: '/land', search: { sheet: 'add' } }))}
            >
              <MapPinPlusIcon aria-hidden />
              New parcel
            </CommandItem>
          )}
          {canAdd && (
            <CommandItem
              value="parcel:upload"
              keywords={['Upload document', 'file scan photo survey c of o deed vault title']}
              onSelect={go(
                () =>
                  void (parcelId
                    ? router.navigate({
                        to: '/land/$parcelId',
                        params: { parcelId },
                        search: (prev) => ({ entity: entityOf(prev), sheet: 'upload' }),
                      })
                    : // Elsewhere: Home's Upload document, which asks for the parcel.
                      router.navigate({
                        to: '/',
                        search: (prev) => ({ ...prev, sheet: 'upload' }),
                      })),
              )}
            >
              <FileUpIcon aria-hidden />
              Upload document
            </CommandItem>
          )}
          {canUpdate && parcelId && (
            <CommandItem
              value="parcel:stage"
              keywords={['Update title stage', 'granted submitted queried c of o consent status']}
              onSelect={go(
                () =>
                  void router.navigate({
                    to: '/land/$parcelId',
                    params: { parcelId },
                    search: (prev) => ({ entity: entityOf(prev), sheet: 'stage' }),
                  }),
              )}
            >
              <ListChecksIcon aria-hidden />
              Update title stage
            </CommandItem>
          )}
        </CommandGroup>
      )}
      {(parcels.length > 0 || searching) && (
        <CommandGroup heading={<span className="flex items-center gap-1.5">Parcels</span>}>
          {searching && (
            // A row, not a heading spinner: it says what's happening, and keeps the list from
            // reading "No pages or actions match" while the server looks.
            <CommandItem
              value="parcel:searching"
              keywords={[search.trim()]}
              disabled
              className="text-muted-foreground"
            >
              <LoaderCircleIcon aria-hidden className="animate-spin motion-reduce:animate-none" />
              Searching parcels…
            </CommandItem>
          )}
          {parcels.map((parcel) => (
            <CommandItem
              key={parcel.id}
              value={`parcel:${parcel.id}`}
              className={searching ? 'opacity-60' : undefined}
              // The server already matched it (name, area, LGA or "p12" for P-0012): the search
              // itself is a keyword, so the palette's own filter never hides it, and it counts
              // as a match (forceMount rows don't, which showed "No pages or actions match").
              keywords={[
                parcel.name,
                parcel.reference,
                parcel.area ?? '',
                parcel.lga,
                search.trim(),
              ]}
              onSelect={go(
                () =>
                  void router.navigate({
                    to: '/land/$parcelId',
                    params: { parcelId: parcel.id },
                  }),
              )}
            >
              <MapPinIcon aria-hidden />
              <span className="truncate">{parcel.name}</span>
              <CommandHint>
                {parcel.reference} · {placeName(parcel)} · {hectaresText(parcel.sizeSqm)}
              </CommandHint>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )
}
