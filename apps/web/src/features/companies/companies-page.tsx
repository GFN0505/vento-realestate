import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { Entity } from '@vento/shared'
import { useEffect, useRef } from 'react'
import { PageHeader } from '@/components/page-header'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { shellUi } from '@/features/shell/shell-ui'
import { PAGE_SHORTCUT_EVENT } from '@/features/shell/shortcuts'
import { usePageTitle } from '@/features/shell/use-page-title'
import { TeamPagination } from '@/features/team/team-pagination'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { ArchiveCompanyConfirm } from './archive-company-confirm'
import { CompaniesCards } from './companies-cards'
import { CompaniesContextLine } from './companies-context-line'
import { companiesListQuery } from './companies-queries'
import { COMPANIES_PAGE_SIZE, type CompaniesSearch } from './companies-search'
import {
  AddCompanyButton,
  CompaniesEmpty,
  CompaniesError,
  CompaniesSkeleton,
} from './companies-states'
import { CompaniesTable } from './companies-table'
import { CompaniesToolbar } from './companies-toolbar'
import { companyRights } from './company-rights'
import { CompanyRowMenu } from './company-row-menu'
import { companyLimitReached, openAddCompany } from './open-add-company'
import { useArchiveCompany } from './use-archive-company'

const route = getRouteApi('/_app/_shell/settings/companies')

/**
 * Settings → Companies (board SetOrg's entities table, as its own section): the holding company
 * and each SPV. Organization-wide, so the switcher hides; a limited admin sees only theirs.
 */
export function CompaniesPage() {
  usePageTitle('Companies', { module: 'settings' })
  const me = useMe()
  const access = useEffectiveAccess()
  const phone = useMediaQuery(PHONE_QUERY)
  // Below xl the settings column is too narrow for four columns: cards, and actions in the sheet.
  const compact = useMediaQuery('(max-width: 1279px)')
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const list = useQuery(companiesListQuery(search))
  const archive = useArchiveCompany()
  const rights = companyRights(me, access.permissions)
  const data = list.data
  const archived = search.show === 'archived'
  const organizationName = me.organization?.name ?? 'Your organization'

  const update = (patch: Partial<CompaniesSearch>, options?: { replace?: boolean }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: options?.replace })
  const plan = access.showUpgradeHints ? me.plan : null
  // Owners know their limit: Restore at the limit opens the plan message instead of a refusal.
  const atLimit = companyLimitReached(plan)
  const add = () => openAddCompany(plan)
  const open = (company: Entity) => shellUi.openCompany({ mode: 'edit', company })
  useAddShortcut(rights.add, add)

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <PageHeader
        title="Companies"
        description={<CompaniesContextLine counts={data?.counts} archived={archived} />}
        actions={rights.add && <AddCompanyButton onClick={add} />}
        className="[&>div:last-child]:max-md:hidden"
      />
      <CompaniesToolbar search={search} update={update} />
      <div
        aria-busy={list.isFetching || undefined}
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-150',
          list.isPlaceholderData && list.isFetching && 'opacity-60',
        )}
      >
        {list.isError && !data ? (
          <CompaniesError onRetry={() => void list.refetch()} retrying={list.isFetching} />
        ) : !data ? (
          <CompaniesSkeleton phone={compact} />
        ) : data.items.length === 0 ? (
          <CompaniesEmpty
            archived={archived}
            query={search.q}
            onClear={() => update({ q: undefined, page: undefined })}
          />
        ) : compact ? (
          <CompaniesCards rows={data.items} onOpen={open} />
        ) : (
          <CompaniesTable
            rows={data.items}
            onOpen={open}
            menu={(company) => (
              <CompanyRowMenu
                company={company}
                rights={rights}
                lastActive={data.counts.active <= 1}
                organizationName={organizationName}
                onEdit={() => open(company)}
                onArchive={() => void archive.archive(company)}
                restoreNote={atLimit ? "All your plan's companies are in use." : null}
                onRestore={() =>
                  atLimit
                    ? window.setTimeout(() => shellUi.open('companyPlan'), 150)
                    : void archive.restore(company)
                }
              />
            )}
          />
        )}
        {data && (
          <TeamPagination
            page={search.page ?? 1}
            pageSize={COMPANIES_PAGE_SIZE}
            total={data.total}
            onPage={(page) => update({ page: page > 1 ? page : undefined })}
          />
        )}
      </div>
      {rights.add && phone && (
        // Phones: the primary action sits above the tabs and the home indicator.
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 md:hidden">
          <AddCompanyButton onClick={add} className="w-full shadow-lg" />
        </div>
      )}
      <ArchiveCompanyConfirm actions={archive} />
    </div>
  )
}

/** `n` opens Add company, on this page only (listed under `?`). */
function useAddShortcut(enabled: boolean, add: () => void) {
  const latest = useRef(add)
  latest.current = add
  useEffect(() => {
    if (!enabled) return
    function onShortcut(event: Event) {
      if ((event as CustomEvent<string>).detail === 'companies-add') latest.current()
    }
    window.addEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
    return () => window.removeEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
  }, [enabled])
}
