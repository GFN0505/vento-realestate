import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPage } from '@/features/approvals/approvals-page'
import { approvalDetailQuery, approvalsListQuery } from '@/features/approvals/approvals-queries'
import { approvalsGuard, firstApprovalsVisit } from '@/features/approvals/approvals-route'
import { validateApprovalsSearch } from '@/features/approvals/approvals-search'

export const Route = createFileRoute('/_app/_shell/approvals')({
  // Before any loader: someone who can't see Approvals gets the 404 and requests nothing.
  beforeLoad: approvalsGuard,
  validateSearch: validateApprovalsSearch,
  loaderDeps: ({ search: { tab, page, entity, id } }) => ({ tab, page, entity, id }),
  loader: async ({ context: { queryClient }, deps }) => {
    // Side by side: the open request (an email's link) never waits for the list.
    if (deps.id) void queryClient.prefetchQuery(approvalDetailQuery(deps.id))
    const list = queryClient.fetchQuery(approvalsListQuery(deps)).then(
      (data) => {
        // Larger screens open the oldest request on arrival: fetch it once its id is known.
        const first = data.items[0]
        if (!deps.id && first && window.matchMedia('(min-width: 768px)').matches) {
          void queryClient.prefetchQuery(approvalDetailQuery(first.id))
        }
      },
      // A failure shows "Approvals couldn't load" with Try again.
      () => undefined,
    )
    if (firstApprovalsVisit()) await list
  },
  component: ApprovalsPage,
})
