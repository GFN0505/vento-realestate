import {
  type ApprovalChange,
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type PermissionSet,
  permissionChanges,
  permissionSet,
} from '@vento/shared'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { toPermissionSet } from '@/access/context'
import { widerThan } from '@/access/manage-rules'
import type { ApprovalPlugin, ExecuteResult } from '@/approvals/plugin'
import type { DbOrTx } from '@/db/client'
import type { ApprovalExclusion } from '@/db/schema'
import { notFound } from '@/lib/errors'
import { applyRoleUpdate, holderCounts, loadRoles } from './roles.service'

// "Change a role's permissions" (access.role.update). The rule guards what a role can do and its
// two-step setting; a rename alone runs at once, and so does any edit to a role nobody holds
// (plan question 1). Everything is applied by applyRoleUpdate, the only writer of a role save.

export const roleUpdatePayload = z.object({
  roleId: z.uuid(),
  /** The role's version when it was asked; a later save makes the request out of date. */
  version: z.number().int().min(1),
  name: z.string(),
  description: z.string(),
  requiresTwoStep: z.boolean(),
  permissions: permissionSet,
})
export type RoleUpdatePayload = z.infer<typeof roleUpdatePayload>

const ACTION_WORDS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
}

function actionsText(actions: readonly PermissionAction[]): string {
  const known = PERMISSION_ACTIONS.filter((a) => actions.includes(a))
  return known.length === 0 ? 'No access' : known.map((a) => ACTION_WORDS[a]).join(', ')
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No')

/** "Site engineer: Projects & construction approve added", or "Site engineer: 3 changes". */
function titleOf(name: string, before: PermissionSet, p: RoleUpdatePayload, twoStep: boolean) {
  const changes = permissionChanges(before, p.permissions)
  const count = changes.reduce((n, c) => n + c.added.length + c.removed.length, 0)
  const only = changes[0]
  // Two-step switching on with it is a consequence (approvers need two-step), not news.
  if (count === 1 && only && !(twoStep && !p.requiresTwoStep)) {
    const [action, verb] = only.added[0] ? [only.added[0], 'added'] : [only.removed[0], 'removed']
    return `${name}: ${MODULE_LABELS[only.module]} ${action} ${verb}`
  }
  if (count === 0 && twoStep) return `${name}: two-step ${p.requiresTwoStep ? 'on' : 'off'}`
  const total = count + (twoStep ? 1 : 0)
  return `${name}: ${total} permission changes`
}

/** Holders of the role, and Settings approvers whose own access doesn't cover the new set. */
async function excludedFor(
  tx: DbOrTx,
  organizationId: string,
  p: RoleUpdatePayload,
): Promise<ApprovalExclusion[]> {
  const result = await tx.execute<{
    user_id: string
    role_id: string
    permissions: string[] | null
  }>(
    sql`
      select m.user_id, m.role_id,
        (select array_agg(rp.module || '.' || rp.action) from role_permissions rp
          where rp.role_id = m.role_id) as permissions
      from members m
      where m.organization_id = ${organizationId} and m.status = 'active'
        and (m.role_id = ${p.roleId} or exists (
          select 1 from role_permissions rp where rp.role_id = m.role_id
            and rp.module = 'settings' and rp.action = 'approve'))
    `,
  )
  return result.rows.flatMap((row): ApprovalExclusion[] => {
    if (row.role_id === p.roleId) {
      return [
        {
          userId: row.user_id,
          reason: 'You have this role, so another owner or admin approves changes to it.',
        },
      ]
    }
    if (widerThan({ permissions: toPermissionSet(row.permissions ?? []) }, p.permissions)) {
      return [
        {
          userId: row.user_id,
          reason: "This change gives access you don't have, so another owner or admin approves it.",
        },
      ]
    }
    return []
  })
}

/** Whether anyone holds the role (members or open invitations): only then does a rule apply. */
export async function roleIsHeld(
  tx: DbOrTx,
  organizationId: string,
  roleId: string,
): Promise<boolean> {
  const holders = (await holderCounts(tx, organizationId, [roleId])).get(roleId)
  return Boolean(holders && holders.members + holders.invited > 0)
}

export const roleUpdatePlugin: ApprovalPlugin<RoleUpdatePayload, ExecuteResult> = {
  key: 'access.role.update',
  permission: { module: 'settings', action: 'edit' },
  payload: roleUpdatePayload,
  subject: (p) => ({ type: 'role', id: p.roleId }),
  async describe(tx, ctx, p) {
    const [current] = await loadRoles(tx, ctx.organizationId, [p.roleId])
    if (!current) throw notFound()
    const twoStep = current.requiresTwoStep !== p.requiresTwoStep
    const changes: ApprovalChange[] = [
      ...(current.name !== p.name ? [{ field: 'Name', before: current.name, after: p.name }] : []),
      ...permissionChanges(current.permissions, p.permissions).map((c) => ({
        field: MODULE_LABELS[c.module],
        before: actionsText(current.permissions[c.module]),
        after: actionsText(p.permissions[c.module]),
      })),
      ...(twoStep
        ? [
            {
              field: 'Two-step required',
              before: yesNo(current.requiresTwoStep),
              after: yesNo(p.requiresTwoStep),
            },
          ]
        : []),
    ]
    return {
      entityId: null,
      summary: {
        title: titleOf(current.name, current.permissions, p, twoStep),
        recordLabel: current.name,
        recordLink: `/settings/roles/${current.id}`,
        amount: null,
        changes,
      },
    }
  },
  excluded: (tx, ctx, p) => excludedFor(tx, ctx.organizationId, p),
  execute: (tx, ctx, p, meta) => applyRoleUpdate(tx, ctx, p, meta),
  async appliesTo(tx, ctx, subject) {
    // Roles are organization-wide: no company to name.
    const applies =
      subject.type === 'role' && (await roleIsHeld(tx, ctx.organizationId, subject.id))
    return { applies, entityId: null }
  },
}
