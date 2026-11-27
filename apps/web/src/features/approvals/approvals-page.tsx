import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { APPROVAL_COPY, type ApprovalRequestRow } from '@vento/shared'
import { PageHeader } from '@/components/page-header'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useMe } from '@/features/preview/use-effective-permissions'
import { usePageTitle } from '@/features/shell/use-page-title'
import { TeamPagination } from '@/features/team/team-pagination'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { ApprovalPane } from './approval-pane'
import { ApprovalPhonePage } from './approval-phone-page'
import { ApprovalRowContent, approvalRowClass } from './approval-row'
import { approvalsListQuery } from './approvals-queries'
import { APPROVALS_PAGE_SIZE } from './approvals-search'
import { ApprovalsEmpty, DetailSkeleton, ListSkeleton, LoadError } from './approvals-states'
import { ApprovalsTabs } from './approvals-tabs'
import { neighbourOf, useApprovalKeys } from './use-approval-keys'

const route = getRouteApi('/_app/_shell/approvals')

const card = 'overflow-hidden rounded-[10px] border bg-card'

/**
 * Approvals (boards Approvals, ApprovalsMobile; queue archetype): the list on the left and the
 * open request on the right from md, the oldest waiting request open on arrival. Phones list
 * only; a row opens its own page. Follows the company switcher (decision 0014).
 */
export function ApprovalsPage() {
  const phone = useMediaQuery(PHONE_QUERY)
  const id = route.useSearch({ select: (s) => s.id })
  usePageTitle(phone && id ? 'Approval' : 'Approvals')
  return phone && id ? <ApprovalPhonePage id={id} /> : <Inbox phone={phone} />
}

function Inbox({ phone }: { phone: boolean }) {
  const me = useMe()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const entity = useCurrentEntity()
  const tab = search.tab ?? 'waiting'
  const list = useQuery(approvalsListQuery(search))
  const data = list.data
  const items = data?.items ?? []
  const ids = items.map((r) => r.id)
  const selected = phone ? undefined : (search.id ?? ids[0])
  const scoped = entity.entity && !entity.locked ? entity.entity : null
  // Desktop: the request beside the list (a skeleton while the first page loads).
  const showDetail = !phone && (selected !== undefined || (!data && !list.isError))

  const select = (id: string | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, id }), replace: true })
  useApprovalKeys(ids, selected, select)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={APPROVAL_COPY.inboxTitle} description={APPROVAL_COPY.inboxSubtitle} />
      <ApprovalsTabs current={tab} waiting={data?.waitingCount ?? me.approvalsWaiting} />
      {scoped && (
        <p className="-mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          <span>
            Requests in <span className="font-medium text-foreground">{scoped.name}</span>
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
        className={cn(
          'grid items-start gap-4',
          // An empty tab is one calm card, not a list beside a blank pane.
          showDetail && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]',
        )}
      >
        <section
          aria-label="Requests"
          aria-busy={list.isFetching || undefined}
          className={cn(
            card,
            'transition-opacity duration-150',
            list.isPlaceholderData && list.isFetching && 'opacity-60',
          )}
        >
          {list.isError && !data ? (
            <LoadError
              what="Approvals"
              onRetry={() => void list.refetch()}
              retrying={list.isFetching}
            />
          ) : !data ? (
            <ListSkeleton />
          ) : items.length === 0 ? (
            <ApprovalsEmpty
              tab={tab}
              entityName={scoped?.name ?? null}
              onAllEntities={() => entity.select(null)}
            />
          ) : (
            <ul>
              {items.map((row) => (
                <li key={row.id}>
                  <RowLink row={row} phone={phone} current={row.id === selected} />
                </li>
              ))}
            </ul>
          )}
        </section>
        {showDetail && (
          <section aria-label="Request detail" className={cn(card, 'p-5 lg:px-6')}>
            {selected ? (
              <ApprovalPane id={selected} onDecided={() => select(neighbourOf(ids, selected))} />
            ) : (
              <DetailSkeleton />
            )}
          </section>
        )}
      </div>
      {data && (
        <TeamPagination
          page={search.page ?? 1}
          pageSize={APPROVALS_PAGE_SIZE}
          total={data.total}
          onPage={(page) =>
            void navigate({
              search: (prev) => ({ ...prev, page: page > 1 ? page : undefined, id: undefined }),
            })
          }
        />
      )}
    </div>
  )
}

function RowLink({
  row,
  phone,
  current,
}: {
  row: ApprovalRequestRow
  phone: boolean
  current: boolean
}) {
  const tab = route.useSearch({ select: (s) => s.tab })
  const content = <ApprovalRowContent row={row} tab={tab ?? 'waiting'} />
  if (phone) {
    // Phones: the request opens as its own page, and Back returns to the list.
    return (
      <Link
        to="/approvals"
        search={(prev) => ({ ...prev, id: row.id })}
        className={cn(approvalRowClass, 'min-h-16')}
      >
        {content}
      </Link>
    )
  }
  return (
    <Link
      to="/approvals"
      search={(prev) => ({ ...prev, id: row.id })}
      replace
      // Selection, not navigation: the open request is marked as current.
      aria-current={current ? 'true' : undefined}
      className={cn(approvalRowClass, current && 'border-l-primary bg-selected')}
    >
      {content}
    </Link>
  )
}
