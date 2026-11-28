import { getRouteApi, Link } from '@tanstack/react-router'
import { ChevronLeftIcon } from 'lucide-react'
import { ApprovalPane } from './approval-pane'

const route = getRouteApi('/_app/_shell/approvals')

/**
 * Phones (board ApprovalsMobile): one request as its own page, opened from the list or an
 * email's link (`?id=`). The buttons sit in a bar above the tabs; after a decision it goes back
 * to the list, where the next request waits on top.
 */
export function ApprovalPhonePage({ id }: { id: string }) {
  const navigate = route.useNavigate()
  return (
    <div className="flex flex-col gap-4 pb-28">
      <Link
        from="/approvals"
        to="/approvals"
        search={(prev) => ({ ...prev, id: undefined })}
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-sm font-medium text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        Approvals
      </Link>
      <div className="rounded-[14px] border bg-card p-4">
        <ApprovalPane
          id={id}
          page
          onDecided={() =>
            void navigate({ search: (prev) => ({ ...prev, id: undefined }), replace: true })
          }
        />
      </div>
    </div>
  )
}
