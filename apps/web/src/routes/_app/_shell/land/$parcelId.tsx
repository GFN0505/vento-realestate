import { createFileRoute, notFound } from '@tanstack/react-router'
import { ParcelPage } from '@/features/land/detail/parcel-page'
import { validateParcelSearch } from '@/features/land/detail/parcel-search'
import { parcelQuery } from '@/features/land/parcels-queries'
import { isUuid } from '@/lib/search-params'

export const Route = createFileRoute('/_app/_shell/land/$parcelId')({
  codeSplitGroupings: [['loader', 'component']],
  validateSearch: validateParcelSearch,
  // Tabs and sheets aren't deps: switching them never refetches the parcel.
  loader: ({ context: { queryClient }, params }) => {
    if (!isUuid(params.parcelId)) throw notFound()
    // Not awaited: the page shows its skeleton at once; a failure shows Try again in place.
    void queryClient.prefetchQuery(parcelQuery(params.parcelId))
  },
  component: ParcelPage,
})
