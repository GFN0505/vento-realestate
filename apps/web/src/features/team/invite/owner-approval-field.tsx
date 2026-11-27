import { useQuery } from '@tanstack/react-query'
import { APPROVAL_COPY, APPROVAL_TEXT_MAX, type Role } from '@vento/shared'
import { InfoIcon } from 'lucide-react'
import { useId } from 'react'
import { FieldError } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { approvalRulesQuery } from '@/features/approval-rules/rules-queries'
import { errorReason } from '@/lib/error-data'
import type { InviteRow } from './use-invite-draft'

type Props = {
  rows: readonly InviteRow[]
  batchRoleId: string | null
  roles: readonly Pick<Role, 'id' | 'key'>[] | undefined
  reason: string
  onReason: (reason: string) => void
  error: unknown
}

/**
 * "Owner invitations need approval before they're sent" with **Why?** (plan 7, brick 4): shown
 * once someone is invited as an owner and the "Make someone an owner" rule exists. The other
 * rows send at once; the server asks for the reason only when a rule really applies.
 */
export function OwnerApprovalField({ rows, batchRoleId, roles, reason, onReason, error }: Props) {
  const id = useId()
  const ownerIds = new Set(roles?.filter((r) => r.key === 'owner').map((r) => r.id))
  const invitingOwner = rows.some((r) => ownerIds.has(r.roleId ?? batchRoleId ?? ''))
  const rules = useQuery({ ...approvalRulesQuery(), enabled: invitingOwner })
  const ruled = rules.data?.items.some(
    (g) => g.actionKey === 'access.member.make_owner' && g.rules.length > 0,
  )
  if (!invitingOwner || !ruled) return null
  const problem = errorReason(error) === 'reason_required' ? APPROVAL_COPY.reasonRequired : null
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border bg-muted/40 px-3.5 py-3">
      <p className="flex gap-2 text-[13px]">
        <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        Owner invitations need approval before they're sent.
      </p>
      <label htmlFor={`${id}-why`} className="mt-1 font-semibold text-sm">
        Why?
      </label>
      <Textarea
        id={`${id}-why`}
        name="reason"
        rows={2}
        maxLength={APPROVAL_TEXT_MAX}
        value={reason}
        placeholder={APPROVAL_COPY.whyPlaceholder}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-error` : undefined}
        onChange={(event) => onReason(event.target.value)}
      />
      <FieldError id={`${id}-error`} role="alert">
        {problem}
      </FieldError>
    </div>
  )
}
