import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { APPROVAL_COPY, type ApprovalRuleRow } from '@vento/shared'
import { CloudOffIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { ReadOnlyNote } from '@/features/settings/read-only-note'
import { usePageTitle } from '@/features/shell/use-page-title'
import { useMediaQuery } from '@/lib/use-media-query'
import { DeleteRuleConfirm } from './delete-rule-confirm'
import { RuleSheet } from './rule-sheet'
import { RulesCards } from './rules-cards'
import { approvalRulesQuery } from './rules-queries'
import { RulesTable } from './rules-table'

const route = getRouteApi('/_app/_shell/settings/approval-rules')

/**
 * Settings → Approval rules (boards SetApprovalRules, ApprovalRulesMobile; settings archetype).
 * Owners add, edit and delete; everyone else with Settings view reads (spec open question 1).
 * Organization-wide, so the company switcher hides.
 */
export function RulesPage() {
  usePageTitle(APPROVAL_COPY.rulesTitle, { module: 'settings' })
  const access = useEffectiveAccess()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  // Below xl the settings column is too narrow for five columns: cards.
  const compact = useMediaQuery('(max-width: 1279px)')
  const query = useQuery(approvalRulesQuery())
  const data = query.data
  // The server says who may edit; a previewed role only narrows it.
  const canEdit = data?.canEdit === true && access.roleKey === 'owner'
  const [deleting, setDeleting] = useState<ApprovalRuleRow | null>(null)

  const openRule = (rule: string | undefined) =>
    void navigate({ search: rule ? { rule } : {}, replace: rule === undefined })
  const rows = data?.items.flatMap((g) => g.rules) ?? []
  const target =
    !canEdit || !search.rule
      ? null
      : search.rule === 'new'
        ? 'new'
        : (rows.find((r) => r.id === search.rule) ?? null)
  const edit = canEdit ? (row: ApprovalRuleRow) => openRule(row.id) : null

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={APPROVAL_COPY.rulesTitle}
          description={APPROVAL_COPY.rulesSubtitle}
          actions={
            canEdit && (
              <Button onClick={() => openRule('new')} className="max-md:h-11">
                <PlusIcon aria-hidden />
                Add rule
              </Button>
            )
          }
        />
        {data && !canEdit && <ReadOnlyNote>{APPROVAL_COPY.ownersOnly}</ReadOnlyNote>}
        {query.isError && !data ? (
          <EmptyState
            icon={CloudOffIcon}
            action={
              <Button
                variant="outline"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                className="max-md:h-11"
              >
                Try again
              </Button>
            }
          >
            <span role="alert">
              Approval rules couldn't load. Check your connection and try again.
            </span>
          </EmptyState>
        ) : !data ? (
          <RulesSkeleton />
        ) : compact ? (
          <RulesCards groups={data.items} onEdit={edit} />
        ) : (
          <RulesTable groups={data.items} onEdit={edit} onDelete={setDeleting} />
        )}
      </div>
      <RuleSheet target={target} onClose={() => openRule(undefined)} />
      <DeleteRuleConfirm
        row={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => setDeleting(null)}
      />
    </TooltipProvider>
  )
}

function RulesSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-[10px] border bg-card">
      <div className="h-10 border-b bg-muted/40" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-14 items-center gap-4 border-b px-5 last:border-b-0">
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-[12%]" />
          <Skeleton className="h-3.5 w-1/5" />
          <Skeleton className="h-3.5 w-[14%]" />
        </div>
      ))}
    </div>
  )
}
