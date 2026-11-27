import type { ApprovalRuleRow, ApprovalRulesList } from '@vento/shared'
import { EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Fragment } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ApprovedByCell, allArchived, archivedText, CompaniesCell } from './rule-cells'

const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5'
const td = 'px-3 py-3.5 align-top first:pl-5'
const INTERACTIVE = 'button, a, [role="menuitem"]'

type Props = {
  groups: ApprovalRulesList['items']
  /** Owners: the row opens the rule sheet and ⋯ offers Edit and Delete. */
  onEdit: ((row: ApprovalRuleRow) => void) | null
  onDelete: (row: ApprovalRuleRow) => void
}

/**
 * Action · When · Approved by · Companies · Extra condition (board SetApprovalRules), grouped by
 * action, each group closed by its "Below ₦5,000,000: no approval needed" line when it has one.
 * An action with no rule says it runs at once, so owners see the whole catalog.
 */
export function RulesTable({ groups, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Approval rules</caption>
        <thead className="border-b bg-muted/40">
          <tr>
            {['Action', 'When', 'Approved by', 'Companies', 'Extra condition'].map((label) => (
              <th key={label} scope="col" className={th}>
                {label}
              </th>
            ))}
            {onEdit && (
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {groups.map((group) => (
            <Fragment key={group.actionKey}>
              {group.rules.length === 0 ? (
                <tr>
                  <th scope="row" className={cn(td, 'text-left font-semibold')}>
                    {group.label}
                  </th>
                  <td colSpan={onEdit ? 5 : 4} className={cn(td, 'text-muted-foreground')}>
                    No approval needed. It happens at once.
                  </td>
                </tr>
              ) : (
                group.rules.map((row) => (
                  <tr
                    key={row.id}
                    onClick={(event) => {
                      const target = event.target as Element
                      if (!onEdit || target.closest(INTERACTIVE)) return
                      onEdit(row)
                    }}
                    className={cn(
                      onEdit && 'cursor-pointer transition-colors hover:bg-muted/50',
                      allArchived(row) && 'text-muted-foreground',
                    )}
                  >
                    <th scope="row" className={cn(td, 'text-left font-semibold')}>
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="rounded-sm text-left outline-hidden hover:underline hover:underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {group.label}
                        </button>
                      ) : (
                        group.label
                      )}
                      {archivedText(row) && (
                        <span className="block font-normal text-muted-foreground text-xs">
                          {archivedText(row)}
                        </span>
                      )}
                    </th>
                    <td className={cn(td, 'tabular-nums')}>{row.whenText}</td>
                    <td className={td}>
                      <ApprovedByCell row={row} />
                    </td>
                    <td className={td}>
                      <CompaniesCell row={row} />
                    </td>
                    <td className={cn(td, 'text-muted-foreground')}>{row.extraCondition ?? '—'}</td>
                    {onEdit && (
                      <td className={cn(td, 'pr-3 text-right')}>
                        <RuleMenu
                          row={row}
                          label={group.label}
                          onEdit={onEdit}
                          onDelete={onDelete}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
              {group.belowThreshold && (
                <tr>
                  <td
                    colSpan={onEdit ? 6 : 5}
                    className="bg-muted/40 px-5 py-2 text-muted-foreground text-xs"
                  >
                    {group.belowThreshold}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RuleMenu({
  row,
  label,
  onEdit,
  onDelete,
}: {
  row: ApprovalRuleRow
  label: string
  onEdit: (row: ApprovalRuleRow) => void
  onDelete: (row: ApprovalRuleRow) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}, ${row.whenText.toLowerCase()}`}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted"
      >
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onSelect={() => onEdit(row)}>
          <PencilIcon aria-hidden />
          Edit rule
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDelete(row)}
          className="text-status-rose-fg [&_svg]:text-status-rose-fg!"
        >
          <Trash2Icon aria-hidden />
          Delete rule
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
