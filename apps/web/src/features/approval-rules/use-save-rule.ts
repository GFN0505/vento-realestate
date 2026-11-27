import { useMutation, useQueryClient } from '@tanstack/react-query'
import { APPROVAL_COPY, type ApprovalRuleInput, type ApprovalRuleRow } from '@vento/shared'
import { toast } from 'sonner'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { ruleInput, ruleValues } from './rule-form'
import { approvalRulesQuery } from './rules-queries'

/** Undo stays on screen this long (as everywhere: 8 seconds). */
const UNDO_MS = 8000

type Save = { id: string; version: number } | null

/**
 * Save rule: create or update (with the version the sheet loaded). The sheet keeps its fields on
 * any refusal and shows the server's words ("There's already a rule for …").
 */
export function useSaveRule(onSaved: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ editing, input }: { editing: Save; input: ApprovalRuleInput }) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return editing
        ? client.approvalRules.update({ ...input, id: editing.id, version: editing.version })
        : client.approvalRules.create(input)
    },
    onSuccess: () => {
      toast.success(APPROVAL_COPY.ruleSaved)
      void queryClient.invalidateQueries({ queryKey: approvalRulesQuery().queryKey })
      onSaved()
    },
  })
}

/**
 * Delete rule, after the confirm: "Rule deleted · Undo". Undo re-creates it from the row (a new
 * rule with the same action, amount, steps and companies), as the plan says.
 */
export function useDeleteRule(onDeleted: () => void) {
  const queryClient = useQueryClient()
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: approvalRulesQuery().queryKey })
  return useMutation({
    mutationFn: (row: ApprovalRuleRow) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.approvalRules.delete({ id: row.id })
    },
    onSuccess: (_, row) => {
      refresh()
      onDeleted()
      toast.success('Rule deleted', {
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () =>
            void client.approvalRules.create(ruleInput(ruleValues(row))).then(() => {
              toast.success('Rule put back')
              refresh()
            }, toastApiError),
        },
      })
    },
    onError: (error) => {
      refresh()
      toastApiError(error)
    },
  })
}
