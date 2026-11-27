import type { ApprovalChange } from '@vento/shared'

const DASH = '—'

/**
 * Field · Before · After (board Approvals): before struck through and muted, after in weight.
 * A real table so screen readers announce each column; on phones it stays three columns and
 * long values wrap rather than scroll.
 */
export function ChangesTable({ changes }: { changes: readonly ApprovalChange[] }) {
  if (changes.length === 0) return null
  return (
    <div className="overflow-hidden rounded-[10px] border">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">What changes</caption>
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[35%]" />
          <col className="w-[35%]" />
        </colgroup>
        <thead className="bg-muted/50">
          <tr>
            {['Field', 'Before', 'After'].map((label) => (
              <th
                key={label}
                scope="col"
                className="px-3 py-2 text-left font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y border-t tabular-nums">
          {changes.map((change, index) => (
            // Fields can repeat (one row per module): the position keeps keys unique.
            // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder.
            <tr key={index} className="align-top">
              <th scope="row" className="px-3 py-2.5 text-left font-normal text-muted-foreground">
                {change.field}
              </th>
              <td className="break-words px-3 py-2.5 text-muted-foreground">
                {change.before === null ? DASH : <del>{change.before}</del>}
              </td>
              <td className="break-words px-3 py-2.5 font-semibold">
                {change.after === null ? DASH : <ins className="no-underline">{change.after}</ins>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
