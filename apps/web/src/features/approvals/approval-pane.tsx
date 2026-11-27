import { useQuery } from '@tanstack/react-query'
import { SearchXIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { isNotFound } from '@/lib/error-data'
import { ApprovalDetail } from './approval-detail'
import { approvalDetailQuery } from './approvals-queries'
import { DetailSkeleton, LoadError } from './approvals-states'

export const NOT_AVAILABLE = "This request isn't available to you. It may have been decided."

/** One request, loading in place: skeleton, "couldn't load" with Try again, or not yours. */
export function ApprovalPane({
  id,
  onDecided,
  page = false,
}: {
  id: string
  onDecided: () => void
  page?: boolean
}) {
  const query = useQuery(approvalDetailQuery(id))
  if (query.data) {
    // Keyed by request: a comment typed on one never carries to the next.
    return <ApprovalDetail key={id} detail={query.data} onDecided={onDecided} page={page} />
  }
  if (query.isError && isNotFound(query.error)) {
    return (
      <EmptyState icon={SearchXIcon} className="border-0">
        {NOT_AVAILABLE}
      </EmptyState>
    )
  }
  if (query.isError) {
    return (
      <LoadError
        what="This request"
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  }
  return <DetailSkeleton />
}
