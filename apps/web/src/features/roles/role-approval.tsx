import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type ApprovalRulesList,
  MODULE_LABELS,
  type ModuleChange,
  type PermissionAction,
} from '@vento/shared'
import { ruleTitle } from '@/features/approval-rules/rules-cards'
import { approvalRulesQuery } from '@/features/approval-rules/rules-queries'
import { approvalPreviewQuery } from '@/features/approvals/send/approval-preview'

/**
 * Whether saving this role's permissions needs approval (a rule applies and someone holds the
 * role), by whom, and whether a request already waits. Only asked when the viewer can edit.
 */
export function useRoleApproval(roleId: string, canEdit: boolean) {
  const queryClient = useQueryClient()
  const options = approvalPreviewQuery('access.role.update', { type: 'role', id: roleId })
  const preview = useQuery({ ...options, enabled: canEdit })
  const data = preview.data?.needed ? preview.data : null
  return {
    needed: data !== null,
    chain: data?.chain ?? null,
    blocked: data?.blocked ?? null,
    pendingId: data?.pendingRequestId ?? null,
    refresh: () => void queryClient.invalidateQueries({ queryKey: options.queryKey }),
  }
}

const ACTION_WORDS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
}

/** "Projects: Approve added; Delete removed". */
export function changeLine(change: ModuleChange): string {
  const parts = [
    change.added.length > 0 && `${change.added.map((a) => ACTION_WORDS[a]).join(', ')} added`,
    change.removed.length > 0 && `${change.removed.map((a) => ACTION_WORDS[a]).join(', ')} removed`,
  ].filter(Boolean)
  return `${MODULE_LABELS[change.module]}: ${parts.join('; ')}`
}

/** The send sheet's summary: the role, then each module that changes. */
export function RoleChangeSummary({
  roleName,
  changes,
  twoStep,
}: {
  roleName: string
  changes: readonly ModuleChange[]
  /** The new two-step value when it changes; null when it doesn't. */
  twoStep: boolean | null
}) {
  return (
    <>
      <p className="font-semibold">{roleName}: permissions</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
        {changes.map((change) => (
          <li key={change.module}>{changeLine(change)}</li>
        ))}
        {twoStep !== null && <li>Two-step sign-in: {twoStep ? 'required' : 'not required'}</li>}
      </ul>
    </>
  )
}

/** "Change a role's permissions; PO over ₦20m (step 2)": every rule step this role approves. */
export function approvesText(groups: ApprovalRulesList['items'], roleId: string): string | null {
  const parts: string[] = []
  for (const group of groups) {
    for (const rule of group.rules) {
      const steps = rule.steps.filter((s) => s.roles.some((r) => r.id === roleId))
      if (steps.length === 0) continue
      const where =
        rule.steps.length > 1 ? ` (step ${steps.map((s) => s.position).join(', ')})` : ''
      parts.push(`${ruleTitle(group.label, rule)}${where}`)
    }
  }
  return parts.length > 0 ? parts.join('; ') : null
}

/**
 * Under the grid (spec "On the role page"): what this role approves, linking to Approval rules.
 * Rules are the one place approval limits live, so the grid has no "up to a limit" cell.
 */
export function RoleApprovesLine({ roleId }: { roleId: string }) {
  const rules = useQuery(approvalRulesQuery())
  const text = rules.data ? approvesText(rules.data.items, roleId) : null
  if (!text) return null
  return (
    <p className="text-[13px] text-muted-foreground">
      <span className="font-semibold text-foreground">Approves:</span> {text} ·{' '}
      <Link
        to="/settings/approval-rules"
        className="rounded-sm font-semibold text-link underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:inline-block max-md:py-2"
      >
        Approval rules
      </Link>
    </p>
  )
}
