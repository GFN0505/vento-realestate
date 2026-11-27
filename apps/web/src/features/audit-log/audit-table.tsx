import { AUDIT_MODULE_LABELS, type AuditRow } from '@vento/shared'
import { Avatar } from '@/components/avatar'
import { changeText, whenText, whereText, whoAndWhat } from './audit-words'

const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5'
const td = 'px-3 py-3 align-top first:pl-5'
const INTERACTIVE = 'button, a'

type Props = { rows: readonly AuditRow[]; onOpen: (row: AuditRow) => void }

/** Who, as the board shows it: initials and a name ("System" and Vento's own get no initials). */
function Who({ actor }: { actor: AuditRow['actor'] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {actor.kind === 'person' && (
        <Avatar name={actor.name} className="size-6 border bg-muted text-[10px] text-foreground" />
      )}
      <span className="truncate">{actor.name}</span>
    </span>
  )
}

/** Before → after, field by field: "Role: Sales → Finance", or "—" when nothing changed. */
export function Changes({ changes }: { changes: AuditRow['changes'] }) {
  if (changes.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <ul className="flex flex-col gap-0.5">
      {changes.map((change, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fields never reorder within an entry.
        <li key={index} className="wrap-anywhere">
          {changeText(change)}
        </li>
      ))}
    </ul>
  )
}

/**
 * When · Who · Module · What · Before → after · Where (board AuditLog), newest first. Module and
 * Where drop out when the settings column is narrow; the entry sheet has every field.
 */
export function AuditTable({ rows, onOpen }: Props) {
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Audit log</caption>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              When
            </th>
            <th scope="col" className={th}>
              Who
            </th>
            <th scope="col" className={`${th} hidden @4xl:table-cell`}>
              Module
            </th>
            <th scope="col" className={th}>
              What
            </th>
            <th scope="col" className={th}>
              Before → after
            </th>
            <th scope="col" className={`${th} hidden @4xl:table-cell`}>
              Where
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={(event) => {
                if ((event.target as Element).closest(INTERACTIVE)) return
                onOpen(row)
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className={`${td} whitespace-nowrap text-muted-foreground tabular-nums`}>
                {whenText(row.at)}
              </td>
              <td className={td}>
                <Who actor={row.actor} />
              </td>
              <td className={`${td} hidden text-muted-foreground @4xl:table-cell`}>
                {AUDIT_MODULE_LABELS[row.module]}
              </td>
              <td className={td}>
                <button
                  type="button"
                  data-audit-row={row.id}
                  onClick={() => onOpen(row)}
                  className="rounded-sm text-left font-medium outline-hidden hover:underline hover:underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {row.what}
                </button>
              </td>
              <td className={`${td} tabular-nums`}>
                <Changes changes={row.changes} />
              </td>
              <td className={`${td} hidden text-muted-foreground text-xs @4xl:table-cell`}>
                {whereText(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Phones (board AuditLogMobile): what happened, the change and when, one card each. */
export function AuditCards({ rows, onOpen }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            data-audit-row={row.id}
            onClick={() => onOpen(row)}
            className="flex min-h-16 w-full flex-col gap-1 rounded-[14px] border bg-card px-3.5 py-3 text-left outline-hidden active:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="font-semibold text-sm">{whoAndWhat(row)}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {row.changes.length > 0 ? `${row.changes.map(changeText).join('; ')} · ` : ''}
              {whenText(row.at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
