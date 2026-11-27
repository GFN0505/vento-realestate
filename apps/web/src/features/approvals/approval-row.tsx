import type { ApprovalRequestRow, ApprovalsTab } from '@vento/shared'
import { Avatar } from '@/components/avatar'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { ageText, amountText, requestState } from './approval-words'

/** The row's look, shared by the list's links (desktop: `?id=`, phones: `/approvals/$id`). */
export const approvalRowClass =
  'group flex w-full gap-3 border-b border-l-[3px] border-l-transparent px-4 py-3.5 text-left outline-hidden transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'

/**
 * ApprovalRow (board Approvals): the maker's initials, the title and amount, who asked and why,
 * the type chip and age. My requests and Decided add where the request stands.
 */
export function ApprovalRowContent({ row, tab }: { row: ApprovalRequestRow; tab: ApprovalsTab }) {
  const amount = row.amount ? amountText(row.amount) : null
  const state = tab === 'waiting' ? null : requestState(row)
  const when = tab === 'decided' && row.decidedAt ? row.decidedAt : row.createdAt
  return (
    <>
      <Avatar name={row.makerName} className="size-8 border bg-muted text-[11px] text-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 font-semibold text-[13px] line-clamp-2" title={row.title}>
            {row.title}
          </span>
          {amount && (
            <span className="shrink-0 font-semibold text-[13px] tabular-nums">{amount.main}</span>
          )}
        </span>
        <span className="truncate text-muted-foreground text-xs group-aria-[current=true]:text-selected-foreground">
          {tab === 'mine' ? '' : `${row.makerName} · `}“{row.reason}”
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline">{row.chip}</Badge>
          {state && (
            <StatusBadge tone={state.tone} className="max-w-full truncate">
              <span className="truncate">{state.label}</span>
            </StatusBadge>
          )}
          {row.entity && (
            <span className="truncate text-muted-foreground text-xs group-aria-[current=true]:text-selected-foreground">
              {row.entity.name}
            </span>
          )}
          <span className="ml-auto text-muted-foreground text-[11px] tabular-nums group-aria-[current=true]:text-selected-foreground">
            {ageText(when)}
          </span>
        </span>
      </span>
    </>
  )
}
