import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stepText } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { SYSTEM_ACTOR } from '@/approvals/engine'
import { loadRules } from '@/approvals/rules'
import type { DbOrTx } from '@/db/client'
import { approvalRules, auditEvents, rolePermissions, roles } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, type TestOrg } from '@/test/factories'

// Migration 0024's two statements (land slice 2, plan §3), run on the state they were written
// for: an organization from before slice 2, with no clearing rule and Finance without Approve in
// Land & title. Every test database runs 0000–0024 in one transaction (global-setup), which is
// the enum-value risk of plan §13 checked on every run.

const file = resolve(import.meta.dirname, '../../drizzle/0024_encumbrance_clear_rule.sql')
const statements = readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter((s) => s !== '')

async function run(tx: DbOrTx) {
  for (const statement of statements) await tx.execute(sql.raw(statement))
}

/** As before slice 2: Finance views Land & title but can't approve in it. */
async function beforeSlice2(tx: DbOrTx, org: TestOrg) {
  const finance = org.roleIds.get('finance') ?? ''
  await tx
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, finance),
        eq(rolePermissions.module, 'land'),
        eq(rolePermissions.action, 'approve'),
      ),
    )
  return finance
}

async function clearingRules(tx: DbOrTx, org: TestOrg) {
  const result = await tx.execute<{ position: number; keys: string[] }>(sql`
    select s.position, array_agg(r.key order by r.key) as keys
    from approval_rules ar
    join approval_rule_steps s on s.rule_id = ar.id
    join approval_rule_step_roles sr on sr.step_id = s.id
    join roles r on r.id = sr.role_id
    where ar.organization_id = ${org.id} and ar.action_key = 'land.encumbrance.clear'
    group by s.position order by s.position`)
  return result.rows
}

async function versionOf(tx: DbOrTx, roleId: string) {
  const [row] = await tx.select({ version: roles.version }).from(roles).where(eq(roles.id, roleId))
  return row?.version
}

describe('migration 0024 at deploy', () => {
  it('gives Finance Approve in Land & title and writes the default rule once', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createMember(tx, org, { role: 'finance' })
      const finance = await beforeSlice2(tx, org)
      const version = await versionOf(tx, finance)
      await run(tx)
      expect(await clearingRules(tx, org)).toEqual([
        { position: 1, keys: ['admin', 'finance', 'land_legal'] },
        { position: 2, keys: ['owner'] },
      ])
      const [rule] = await tx
        .select()
        .from(approvalRules)
        .where(eq(approvalRules.organizationId, org.id))
      expect(rule).toMatchObject({
        minAmount: null,
        appliesToAll: true,
        createdByMemberId: org.ownerMemberId,
      })
      const approve = await tx
        .select()
        .from(rolePermissions)
        .where(and(eq(rolePermissions.roleId, finance), eq(rolePermissions.module, 'land')))
      expect(approve.map((p) => p.action).sort()).toEqual(['approve', 'view'])
      expect(await versionOf(tx, finance)).toBe((version ?? 0) + 1)
    }))

  it('writes one audit event per organization for each change, by System (security L1)', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const finance = await beforeSlice2(tx, org)
      await run(tx)
      const [rule] = await tx
        .select({ id: approvalRules.id })
        .from(approvalRules)
        .where(eq(approvalRules.organizationId, org.id))
      const events = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            sql`${auditEvents.metadata}->>'migration' = '0024_encumbrance_clear_rule'`,
          ),
        )
        .orderBy(auditEvents.action)
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        action: 'approval_rule.created',
        actorUserId: null,
        actorName: SYSTEM_ACTOR.name,
        targetType: 'approval_rule',
        targetId: rule?.id,
        targetLabel: 'Clear an encumbrance',
        after: {
          action: 'Clear an encumbrance',
          when: 'Any amount',
          approvedBy: 'Admin, Land & legal or Finance → Owner',
          companies: 'All companies',
        },
        metadata: { actionKey: 'land.encumbrance.clear', version: 1 },
      })
      expect(events[1]).toMatchObject({
        action: 'role.updated',
        actorUserId: null,
        actorName: SYSTEM_ACTOR.name,
        targetType: 'role',
        targetId: finance,
        targetLabel: 'Finance',
        before: { permissions: { land: ['view'] } },
        after: { permissions: { land: ['view', 'approve'] } },
        metadata: {
          version: await versionOf(tx, finance),
          changes: [{ module: 'land', added: ['approve'], removed: [] }],
        },
      })
      // Run again: nothing changes, so nothing more is audited.
      await run(tx)
      const again = await tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            sql`${auditEvents.metadata}->>'migration' = '0024_encumbrance_clear_rule'`,
          ),
        )
      expect(again).toHaveLength(2)
    }))

  it('reads in the audit log with the words the rule sheet uses', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await beforeSlice2(tx, org)
      await run(tx)
      const [rule] = await loadRules(tx, org.id, 'land.encumbrance.clear')
      const approvedBy = rule?.steps.map((s) => stepText(s.map((r) => r.name))).join(' → ')
      expect(approvedBy).toBe('Admin, Land & legal or Finance → Owner')
    }))

  it('is safe to run again: no second rule, no second version bump', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const finance = await beforeSlice2(tx, org)
      await run(tx)
      const version = await versionOf(tx, finance)
      await run(tx)
      expect(
        await tx.select().from(approvalRules).where(eq(approvalRules.organizationId, org.id)),
      ).toHaveLength(1)
      expect(await versionOf(tx, finance)).toBe(version)
    }))
})
