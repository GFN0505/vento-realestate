import { useQuery } from '@tanstack/react-query'
import {
  AUDIT_MODULE_LABELS,
  type AuditDetail,
  type AuditRow,
  NO_APPROVER_NOTE,
} from '@vento/shared'
import { useRef } from 'react'
import { HrefLink } from '@/components/href-link'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangesTable } from '@/features/approvals/changes-table'
import { SheetFrame } from '@/features/team/sheet-frame'
import { auditEntryQuery } from './audit-queries'
import { fullWhenText, whereText } from './audit-words'

type Props = {
  /** The row named by `?open=`, when it's on this page (its summary shows at once). */
  row: AuditRow | undefined
  id: string | undefined
  onClose: () => void
}

/**
 * One entry (pattern: side sheet with facts): every field, the approvals behind it and a link to
 * the record. Opened from the address, so Back closes it; focus returns to its row.
 */
export function AuditEntrySheet({ row, id, onClose }: Props) {
  const last = useRef(id)
  if (id) last.current = id
  const shownId = last.current
  return (
    <Sheet open={id !== undefined} onOpenChange={(open) => !open && onClose()}>
      {shownId && (
        <EntryBody
          id={shownId}
          row={row}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.querySelector<HTMLElement>(`[data-audit-row="${shownId}"]`)?.focus()
          }}
        />
      )}
    </Sheet>
  )
}

function EntryBody({
  id,
  row,
  onCloseAutoFocus,
}: {
  id: string
  row: AuditRow | undefined
  onCloseAutoFocus: (event: Event) => void
}) {
  const query = useQuery(auditEntryQuery(id))
  const entry: AuditRow | AuditDetail | undefined = query.data ?? row
  const detail = query.data
  return (
    <SheetFrame
      title={entry?.what ?? 'Audit entry'}
      description={entry ? fullWhenText(entry.at) : undefined}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {!entry ? (
        query.isError ? (
          <EntryError onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
            <dt className="text-muted-foreground">Who</dt>
            <dd>{entry.actor.name}</dd>
            <dt className="text-muted-foreground">Module</dt>
            <dd>{AUDIT_MODULE_LABELS[entry.module]}</dd>
            {whereText(entry) && (
              <>
                <dt className="text-muted-foreground">Where</dt>
                <dd>{whereText(entry)}</dd>
              </>
            )}
            {detail?.record && (
              <>
                <dt className="text-muted-foreground">Record</dt>
                <dd>
                  {detail.record.link ? (
                    <HrefLink
                      href={detail.record.link}
                      className="rounded-sm font-medium text-link underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {detail.record.label} →
                    </HrefLink>
                  ) : (
                    detail.record.label
                  )}
                </dd>
              </>
            )}
          </dl>
          <section aria-labelledby="audit-changes" className="flex flex-col gap-2 border-t pt-4">
            <h3 id="audit-changes" className="font-heading font-semibold text-[15px]">
              Before → after
            </h3>
            {entry.changes.length > 0 ? (
              <ChangesTable
                changes={entry.changes.map((c) => ({
                  field: c.label,
                  before: c.before,
                  after: c.after,
                }))}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">Nothing to compare.</p>
            )}
          </section>
          {detail && (detail.approvedBy.length > 0 || detail.noApprover) && (
            <section
              aria-labelledby="audit-approvals"
              className="flex flex-col gap-2 border-t pt-4"
            >
              <h3 id="audit-approvals" className="font-heading font-semibold text-[15px]">
                Approvals
              </h3>
              <p className="text-[13px]">
                {detail.approvedBy.length > 0
                  ? `Approved by ${detail.approvedBy.map((a) => a.name).join(', ')}`
                  : `${NO_APPROVER_NOTE}.`}
              </p>
            </section>
          )}
          {query.isPending && <Skeleton aria-hidden className="h-12 w-full" />}
        </>
      )}
    </SheetFrame>
  )
}

function EntryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 text-[13px]">
      <p role="alert">This entry couldn't load. Check your connection and try again.</p>
      <Button variant="outline" onClick={onRetry} className="max-md:h-11">
        Try again
      </Button>
    </div>
  )
}
