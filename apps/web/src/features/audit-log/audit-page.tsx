import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { AUDIT_MODULES } from '@vento/shared'
import { CloudOffIcon, DownloadIcon, LoaderCircleIcon, SearchXIcon } from 'lucide-react'
import { useEffect } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe } from '@/features/preview/use-effective-permissions'
import { usePageTitle } from '@/features/shell/use-page-title'
import { TeamPagination } from '@/features/team/team-pagination'
import { useOnline } from '@/lib/connection'
import { orpc } from '@/lib/orpc'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { AuditEntrySheet } from './audit-entry-sheet'
import { auditListQuery } from './audit-queries'
import {
  AUDIT_PAGE_SIZE,
  auditFilters,
  auditRange,
  hasAuditFilters,
  rangeProblem,
} from './audit-range'
import type { AuditSearch } from './audit-search'
import { AuditCards, AuditTable } from './audit-table'
import { AuditToolbar } from './audit-toolbar'
import { useAuditExport } from './use-audit-export'

const route = getRouteApi('/_app/_shell/settings/audit-log')

/**
 * Settings → Audit log (boards AuditLog, AuditLogMobile; list archetype): every change in the
 * organization, in plain words, newest first. Owners and admins with every company (spec).
 */
export function AuditPage() {
  usePageTitle('Audit log', { module: 'settings' })
  const me = useMe()
  const online = useOnline()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const phone = useMediaQuery(PHONE_QUERY)
  const problem = rangeProblem(auditRange(search))
  const list = useQuery({ ...auditListQuery(search), enabled: problem === null })
  const data = list.data
  const exporter = useAuditExport(
    () => void queryClient.invalidateQueries({ queryKey: orpc.audit.list.key() }),
  )
  const update = (patch: Partial<AuditSearch>, options?: { replace?: boolean }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: options?.replace })

  // A hand-edited module the log doesn't know is dropped, not an error.
  const unknownModule =
    search.module !== undefined && !(AUDIT_MODULES as readonly string[]).includes(search.module)
  useEffect(() => {
    if (unknownModule)
      void navigate({ search: (prev) => ({ ...prev, module: undefined }), replace: true })
  }, [unknownModule, navigate])

  const open = (id: string | undefined) => update({ open: id })
  const exportButton = (compact: boolean) => (
    <Button
      variant="outline"
      size={compact ? 'icon' : 'default'}
      aria-label={compact ? 'Export CSV' : undefined}
      onClick={() => exporter.mutate(auditFilters(search))}
      disabled={exporter.isPending || problem !== null || !online}
      aria-busy={exporter.isPending || undefined}
      title={online ? undefined : "You're offline. Export when you're back online."}
      className={compact ? 'size-11' : undefined}
    >
      {exporter.isPending ? (
        <LoaderCircleIcon aria-hidden className="animate-spin" />
      ) : (
        <DownloadIcon aria-hidden />
      )}
      {!compact && 'Export CSV'}
    </Button>
  )
  const organization = me.organization?.name ?? 'your organization'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        description={`Every change in ${organization}. Entries can't be edited or deleted.`}
        actions={exportButton(false)}
        // Phones: Export sits beside search.
        className="[&>div:last-child]:max-md:hidden"
      />
      <AuditToolbar search={search} update={update} exportAction={exportButton(true)} />
      <div
        aria-busy={list.isFetching || undefined}
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-150',
          list.isPlaceholderData && list.isFetching && 'opacity-60',
        )}
      >
        {problem ? null : list.isError && !data ? (
          <EmptyState
            icon={CloudOffIcon}
            action={
              <Button
                variant="outline"
                onClick={() => void list.refetch()}
                disabled={list.isFetching}
                className="max-md:h-11"
              >
                Try again
              </Button>
            }
          >
            <span role="alert">
              The audit log couldn't load. Check your connection and try again.
            </span>
          </EmptyState>
        ) : !data ? (
          <AuditSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={SearchXIcon}
            action={
              hasAuditFilters(search) && (
                <Button
                  variant="outline"
                  onClick={() => void navigate({ search: {} })}
                  className="max-md:h-11"
                >
                  Clear filters
                </Button>
              )
            }
          >
            No entries match these filters.
          </EmptyState>
        ) : phone ? (
          <AuditCards rows={data.items} onOpen={(row) => open(row.id)} />
        ) : (
          <AuditTable rows={data.items} onOpen={(row) => open(row.id)} />
        )}
        {data && !problem && (
          <TeamPagination
            page={search.page ?? 1}
            pageSize={AUDIT_PAGE_SIZE}
            total={data.total}
            onPage={(page) => update({ page: page > 1 ? page : undefined })}
          />
        )}
      </div>
      <AuditEntrySheet
        id={search.open}
        row={data?.items.find((r) => r.id === search.open)}
        onClose={() => open(undefined)}
      />
    </div>
  )
}

function AuditSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-[10px] border bg-card">
      <div className="h-10 border-b bg-muted/40" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-b px-5 last:border-b-0">
          <Skeleton className="h-3.5 w-1/12" />
          <Skeleton className="h-3.5 w-1/6" />
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-1/4" />
        </div>
      ))}
    </div>
  )
}
