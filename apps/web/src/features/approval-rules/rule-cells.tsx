import type { ApprovalRuleRow } from '@vento/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Every company the rule names is archived: kept, greyed, and applies again on restore. */
export function allArchived(row: Pick<ApprovalRuleRow, 'entities'>): boolean {
  return row.entities !== 'all' && row.entities.every((e) => e.archived)
}

/** "Parkview SPV is archived" / "Parkview SPV and Lekki SPV are archived". */
export function archivedText(row: Pick<ApprovalRuleRow, 'entities'>): string | null {
  if (row.entities === 'all') return null
  const names = row.entities.filter((e) => e.archived).map((e) => e.name)
  if (names.length === 0) return null
  return names.length === 1 ? `${names[0]} is archived` : `${names.join(' and ')} are archived`
}

/** "All companies", or the names with archived ones greyed. */
export function CompaniesCell({ row }: { row: ApprovalRuleRow }) {
  if (row.entities === 'all') return <span>All companies</span>
  return (
    <span className="flex flex-col gap-0.5">
      {row.entities.map((e) => (
        <span key={e.id} className={cn('truncate', e.archived && 'text-muted-foreground')}>
          {e.name}
          {e.archived && <span className="text-xs"> · archived</span>}
        </span>
      ))}
    </span>
  )
}

/** The chain, then any step nobody can approve today, in amber (spec: gaps show before they bite). */
export function ApprovedByCell({ row }: { row: ApprovalRuleRow }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="font-medium">{row.chain}</span>
      {row.gaps.map((gap) => (
        <span
          key={`${gap.position}:${gap.entity?.id ?? 'all'}`}
          className="inline-flex items-start gap-1.5 text-status-amber-fg text-xs"
        >
          <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
          {gap.text}
        </span>
      ))}
    </span>
  )
}
