import { APPROVAL_ACTIONS, type ApprovalRuleRow } from '@vento/shared'
import { useRef } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteRule } from './use-save-rule'

/** "Delete this rule?" A permanent delete confirms (design-system); Undo still puts it back. */
export function DeleteRuleConfirm({
  row,
  onOpenChange,
  onDeleted,
}: {
  row: ApprovalRuleRow | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const remove = useDeleteRule(() => {
    onOpenChange(false)
    onDeleted()
  })
  // Keeps its words while the dialog animates out.
  const last = useRef(row)
  if (row) last.current = row
  const shown = last.current
  const label = shown ? APPROVAL_ACTIONS[shown.actionKey].label : ''
  return (
    <ConfirmDialog
      open={row !== null}
      onOpenChange={onOpenChange}
      title="Delete this rule?"
      confirmLabel="Delete rule"
      destructive
      pending={remove.isPending}
      onConfirm={() => row && remove.mutate(row)}
    >
      {shown
        ? `${label} (${shown.whenText.toLowerCase()}, approved by ${shown.chain}) won't need this approval for new requests. Requests already waiting keep their steps. Every other owner is emailed.`
        : ''}
    </ConfirmDialog>
  )
}
