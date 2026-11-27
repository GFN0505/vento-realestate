import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPage } from '@/features/approvals/approvals-page'
import { approvalDetailQuery, approvalsListQuery } from '@/features/approvals/approvals-queries'
import { approvalsGuard } from '@/features/approvals/approvals-route'
import { validateApprovalsSearch } from '@/features/approvals/approvals-search'

export const Route = createFileRoute('/_app/_shell/approvals')({
  // Before any loader: someone who can't see Approvals gets the 404 and requests nothing.
  beforeLoad: approvalsGuard,
  // The loader travels with the page's chunk, preloaded on hover.
  codeSplitGroupings: [['loader', 'component']],
  validateSearch: validateApprovalsSearch,
  loaderDeps: ({ search: { tab, page, entity, id } }) => ({ tab, page, entity, id }),
  // Started here, never awaited: the list shows its skeleton for a moment instead of holding the
  // navigation, and the open request (an email's link) never waits for the list.
  loader: ({ context: { queryClient }, deps }) => {
    if (deps.id) void queryClient.prefetchQuery(approvalDetailQuery(deps.id))
    void queryClient.fetchQuery(approvalsListQuery(deps)).then(
      // The oldest request opens on arrival: fetch it as soon as its id is known.
      (data) => {
        const first = data.items[0]
        if (first && !deps.id) void queryClient.prefetchQuery(approvalDetailQuery(first.id))
      },
      // A failure shows "Approvals couldn't load" with Try again.
      () => undefined,
    )
  },
  component: ApprovalsPage,
})
