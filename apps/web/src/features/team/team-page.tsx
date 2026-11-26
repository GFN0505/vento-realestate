import { useQuery } from '@tanstack/react-query'
import type { TeamRemovedRow } from '@vento/shared'
import { useEffect } from 'react'
import { PageHeader } from '@/components/page-header'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { shellUi } from '@/features/shell/shell-ui'
import { PAGE_SHORTCUT_EVENT } from '@/features/shell/shortcuts'
import { usePageTitle } from '@/features/shell/use-page-title'
import { can } from '@/lib/permissions'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { RemovedList } from './removed-list'
import { TeamCards } from './team-cards'
import { TeamConfirms } from './team-confirms'
import { TeamContextLine } from './team-context-line'
import { TeamPagination } from './team-pagination'
import { teamListQuery } from './team-queries'
import { TeamRowSheet } from './team-row-sheet'
import { hasFilters, TEAM_PAGE_SIZE } from './team-search'
import {
  BringInYourTeam,
  InviteButtonInline,
  TeamEmpty,
  TeamError,
  TeamSkeleton,
} from './team-states'
import { type ListRow, TeamTable } from './team-table'
import { TEAM_SEARCH_ID, TeamToolbar } from './team-toolbar'
import { TeamActionsContext, useTeamActions } from './use-team-actions'
import { useTeamSearch } from './use-team-search'

/**
 * Team (board RolesSettings, users tab, as a settings section): who's in the organization and
 * who's been asked, in one list. Owners and admins manage it; the server decides what each row
 * allows, and the page only shows those actions.
 */
export function TeamPage() {
  usePageTitle('Team', { module: 'settings' })
  const access = useEffectiveAccess()
  const phone = useMediaQuery(PHONE_QUERY)
  const { search, update } = useTeamSearch()
  const options = teamListQuery(search)
  const list = useQuery(options)
  const actions = useTeamActions(options.queryKey)
  const canInvite = can(access.permissions, 'settings', 'create')
  const show = search.show ?? 'everyone'
  const data = list.data

  useTeamShortcuts(canInvite)

  const rows = (data?.items ?? []).filter((r): r is ListRow => r.kind !== 'removed')
  const removed = (data?.items ?? []).filter((r): r is TeamRemovedRow => r.kind === 'removed')
  const openRow = search.open ? rows.find((r) => r.id === search.open) : undefined
  const open = (row: ListRow) => update({ open: row.id })
  const filtered = hasFilters(search)
  const empty = data !== undefined && data.items.length === 0
  // Only the owner so far: their row, then an invitation to bring the team in.
  const alone =
    show === 'everyone' && !filtered && data?.counts.members === 1 && data.counts.invited === 0

  return (
    <TeamActionsContext.Provider value={actions}>
      <TooltipProvider>
        <div className="flex flex-col gap-5 pb-20 md:pb-0">
          <PageHeader
            title="Team"
            description={<TeamContextLine counts={data?.counts} />}
            actions={canInvite && <InviteButtonInline />}
            className="[&>div:last-child]:max-md:hidden"
          />
          <TeamToolbar search={search} update={update} counts={data?.counts} />
          <div
            aria-busy={list.isFetching || undefined}
            // Old rows stay while new ones load (no flash); dimmed so the wait is visible.
            className={cn(
              'flex flex-col gap-4 transition-opacity duration-150',
              list.isPlaceholderData && 'opacity-60',
            )}
          >
            {list.isError && !data ? (
              <TeamError onRetry={() => void list.refetch()} retrying={list.isFetching} />
            ) : !data ? (
              <TeamSkeleton phone={phone} />
            ) : empty ? (
              <TeamEmpty
                show={show}
                query={search.q}
                filtered={filtered}
                onClear={() => update({ q: undefined, role: undefined })}
              />
            ) : show === 'removed' ? (
              <RemovedList rows={removed} canInvite={canInvite} phone={phone} />
            ) : phone ? (
              <TeamCards rows={rows} onOpen={open} />
            ) : (
              <TeamTable rows={rows} onOpen={open} />
            )}
            {alone && <BringInYourTeam canInvite={canInvite} />}
            {data && (
              <TeamPagination
                page={search.page ?? 1}
                pageSize={TEAM_PAGE_SIZE}
                total={data.total}
                onPage={(page) => update({ page: page > 1 ? page : undefined })}
              />
            )}
          </div>
        </div>
        {canInvite && phone && (
          // Phones: the primary action sits above the tabs and the home indicator.
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 md:hidden">
            <InviteButtonInline className="w-full shadow-lg" />
          </div>
        )}
        <TeamRowSheet
          row={openRow}
          listKey={options.queryKey}
          onClose={() => update({ open: undefined })}
        />
        <TeamConfirms />
      </TooltipProvider>
    </TeamActionsContext.Provider>
  )
}

/** `i` opens Invite people and `/` focuses search, on this page only (listed under `?`). */
function useTeamShortcuts(canInvite: boolean) {
  useEffect(() => {
    function onShortcut(event: Event) {
      const id = (event as CustomEvent<string>).detail
      if (id === 'team-invite' && canInvite) shellUi.openInvite()
      if (id === 'team-search') document.getElementById(TEAM_SEARCH_ID)?.focus()
    }
    window.addEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
    return () => window.removeEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
  }, [canInvite])
}
