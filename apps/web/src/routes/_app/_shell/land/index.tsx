import { createFileRoute } from '@tanstack/react-router'
import { ParcelsPage } from '@/features/land/parcels-page'
import { firstParcelsVisit, parcelsListQuery } from '@/features/land/parcels-queries'
import { validateParcelsSearch } from '@/features/land/parcels-search'

export const Route = createFileRoute('/_app/_shell/land/')({
  // The loader travels with the page's chunk, preloaded on hover.
  codeSplitGroupings: [['loader', 'component']],
  validateSearch: validateParcelsSearch,
  // The sheet isn't a dep: opening Add parcel never refetches the list.
  loaderDeps: ({ search: { q, filter, sort, dir, page, entity } }) => ({
    q,
    filter,
    sort,
    dir,
    page,
    entity,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    // prefetchQuery never throws: a failure shows "Parcels couldn't load" with Try again.
    const load = queryClient.prefetchQuery(parcelsListQuery(deps))
    // The first visit arrives with its rows; after that, chips and search don't wait.
    if (firstParcelsVisit()) await load
  },
  component: ParcelsPage,
})
