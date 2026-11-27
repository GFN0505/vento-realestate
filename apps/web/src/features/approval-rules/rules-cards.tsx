import type { ApprovalRuleRow, ApprovalRulesList } from '@vento/shared'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ApprovedByCell, allArchived, archivedText } from './rule-cells'

/** "Change a role's permissions" or "Purchase order over ₦20,000,000". */
export function ruleTitle(label: string, row: Pick<ApprovalRuleRow, 'minAmount' | 'whenText'>) {
  return row.minAmount === null ? label : `${label} ${row.whenText.toLowerCase()}`
}

/**
 * Phones and narrow columns (board ApprovalRulesMobile): one card per rule, "PO over ₦20m ·
 * Finance → MD"; owners tap for the sheet.
 */
export function RulesCards({
  groups,
  onEdit,
}: {
  groups: ApprovalRulesList['items']
  onEdit: ((row: ApprovalRuleRow) => void) | null
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.actionKey} aria-label={group.label} className="flex flex-col gap-2">
          {group.rules.length === 0 && (
            <Card>
              <span className="font-semibold text-sm">{group.label}</span>
              <span className="text-muted-foreground text-xs">
                No approval needed. It happens at once.
              </span>
            </Card>
          )}
          {group.rules.map((row) => {
            const body = (
              <>
                <span className="font-semibold text-sm">{ruleTitle(group.label, row)}</span>
                <span className="text-[13px]">
                  <ApprovedByCell row={row} />
                </span>
                <span className="text-muted-foreground text-xs">
                  {row.entities === 'all'
                    ? 'All companies'
                    : row.entities.map((e) => e.name).join(', ')}
                  {row.extraCondition ? ` · ${row.extraCondition}` : ''}
                </span>
                {archivedText(row) && (
                  <span className="text-muted-foreground text-xs">{archivedText(row)}</span>
                )}
              </>
            )
            return onEdit ? (
              <button
                key={row.id}
                type="button"
                onClick={() => onEdit(row)}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 text-left outline-hidden active:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring',
                  allArchived(row) && 'text-muted-foreground',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">{body}</span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <Card key={row.id}>{body}</Card>
            )
          })}
          {group.belowThreshold && (
            <p className="px-1 text-muted-foreground text-xs">{group.belowThreshold}</p>
          )}
        </section>
      ))}
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border bg-card px-3.5 py-3">{children}</div>
  )
}
