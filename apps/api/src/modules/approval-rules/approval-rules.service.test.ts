import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { roles } from '@/db/schema'
import { createOrganization as onboard } from '@/modules/onboarding/onboarding.service'
import { withRollback } from '@/test/db'
import {
  createCustomRole,
  createEntity,
  createMember,
  createOrganization,
  createUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { seedDefaultRules } from './approval-rules.service'

// Settings → Approval rules: owners change them, Settings viewers read them (spec question 1).

async function world(tx: DbOrTx) {
  const org = await createOrganization(tx)
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const bisi = await createMember(tx, org, { role: 'owner', name: 'Bisi Lawal' })
  const ope = await createMember(tx, org, { role: 'admin', name: 'Ope Martins' })
  return {
    org,
    bisi,
    ope,
    owner: org.roleIds.get('owner') ?? '',
    admin: org.roleIds.get('admin') ?? '',
  }
}

describe('approval rules: reading', () => {
  it('lists every rule-bearing action with its default rule, read-only for an admin', () =>
    withRollback(async (tx) => {
      const { ope } = await world(tx)
      const list = await clientAs(tx, ope.user).client.approvalRules.list()
      expect(list.canEdit).toBe(false)
      expect(list.items.map((g) => [g.actionKey, g.rules.map((r) => r.chain)])).toEqual([
        ['access.role.update', ['Owner or Admin']],
        ['access.member.make_owner', ['Owner']],
      ])
      expect(list.items[0]?.rules[0]).toMatchObject({
        whenText: 'Any amount',
        entities: 'all',
        extraCondition: "Can't give access the approver doesn't have",
        gaps: [],
      })
    }))

  it('marks a step nobody can approve today', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      const board = await createCustomRole(tx, org, {
        name: 'Board',
        permissions: { settings: ['view', 'approve'] },
      })
      const { client } = clientAs(tx, org.owner)
      await client.approvalRules.delete({
        id: (await client.approvalRules.list()).items[1]?.rules[0]?.id ?? '',
      })
      const { rule } = await client.approvalRules.create({
        actionKey: 'access.member.make_owner',
        when: { kind: 'any' },
        steps: [[owner], [board.id]],
        entityIds: 'all',
      })
      expect(rule.chain).toBe('Owner → Board')
      expect(rule.gaps).toEqual([{ position: 2, entity: null, text: 'Nobody can approve step 2' }])
    }))
})

describe('approval rules: changing', () => {
  it('lets an owner add a rule, audits it and emails every other owner', () =>
    withRollback(async (tx) => {
      const { org, bisi, owner } = await world(tx)
      const parkview = await createEntity(tx, org)
      const { client, mailer } = clientAs(tx, org.owner)
      const saved = await client.approvalRules.create({
        actionKey: 'access.role.update',
        when: { kind: 'any' },
        steps: [[owner]],
        entityIds: [parkview.id],
      })
      expect(saved.notice).toBe('Rule saved. Applies to new requests.')
      expect(saved.rule.entities).toEqual([
        { id: parkview.id, name: parkview.name, archived: false },
      ])
      const sent = mailer.to(bisi.user.email)
      expect(sent.map((m) => m.subject)).toEqual([
        `Vento Real Estate: Olumide Bankole changed an approval rule in ${org.name}`,
      ])
      expect(sent[0]?.text).toContain(`Companies: ${parkview.name}`)
      expect(mailer.to(org.owner.email)).toEqual([])
    }))

  it('refuses an admin with "Only owners can change approval rules."', () =>
    withRollback(async (tx) => {
      const { ope, owner } = await world(tx)
      await expect(
        clientAs(tx, ope.user).client.approvalRules.create({
          actionKey: 'access.role.update',
          when: { kind: 'any' },
          steps: [[owner]],
          entityIds: 'all',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'owner_only' },
        message: 'Only owners can change approval rules.',
      })
    }))

  it('refuses an owner limited to some companies', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      const parkview = await createEntity(tx, org)
      const limited = await createMember(tx, org, { role: 'owner', entityIds: [parkview.id] })
      await expect(
        clientAs(tx, limited.user).client.approvalRules.create({
          actionKey: 'access.role.update',
          when: { kind: 'any' },
          steps: [[owner]],
          entityIds: 'all',
        }),
      ).rejects.toMatchObject({ data: { reason: 'all_entities_required' } })
    }))

  it('refuses a second rule for the same action, amount and companies', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      await expect(
        clientAs(tx, org.owner).client.approvalRules.create({
          actionKey: 'access.role.update',
          when: { kind: 'any' },
          steps: [[owner]],
          entityIds: 'all',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'approval_rule_exists' },
        message: "There's already a rule for Change a role's permissions in all companies.",
      })
    }))

  it('refuses overlapping company rules, naming the company', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      const parkview = await createEntity(tx, org)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      const { client } = clientAs(tx, org.owner)
      const input = {
        actionKey: 'access.role.update' as const,
        when: { kind: 'any' as const },
        steps: [[owner]],
      }
      await client.approvalRules.create({ ...input, entityIds: [parkview.id] })
      await expect(
        client.approvalRules.create({ ...input, entityIds: [lekki.id, parkview.id] }),
      ).rejects.toMatchObject({
        message: `There's already a rule for Change a role's permissions in ${parkview.name}.`,
      })
    }))

  it('refuses a role without Approve in the action’s module', () =>
    withRollback(async (tx) => {
      const { org } = await world(tx)
      await expect(
        clientAs(tx, org.owner).client.approvalRules.create({
          actionKey: 'access.member.make_owner',
          when: { kind: 'any' },
          steps: [[org.roleIds.get('sales') ?? '']],
          entityIds: 'all',
        }),
      ).rejects.toMatchObject({
        message: "Sales can't approve in Settings. Give it Approve on its role first.",
      })
    }))

  it('refuses an amount on an action without one', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      await expect(
        clientAs(tx, org.owner).client.approvalRules.create({
          actionKey: 'access.role.update',
          when: { kind: 'over', amount: '5000000' },
          steps: [[owner]],
          entityIds: 'all',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }))

  it('saves an edit with the version it loaded, and refuses a stale one naming who saved', () =>
    withRollback(async (tx) => {
      const { org, bisi, owner } = await world(tx)
      const rule = (await clientAs(tx, org.owner).client.approvalRules.list()).items[0]?.rules[0]
      if (!rule) throw new Error('default rule missing')
      const edit = {
        id: rule.id,
        version: 1,
        actionKey: 'access.role.update' as const,
        when: { kind: 'any' as const },
        steps: [[owner]],
        entityIds: 'all' as const,
      }
      const saved = await clientAs(tx, bisi.user).client.approvalRules.update(edit)
      expect(saved.rule).toMatchObject({ version: 2, chain: 'Owner' })
      await expect(clientAs(tx, org.owner).client.approvalRules.update(edit)).rejects.toMatchObject(
        {
          data: { reason: 'approval_rule_changed', changedByName: 'Bisi Lawal' },
        },
      )
    }))

  it('deletes a rule and tells the other owners', () =>
    withRollback(async (tx) => {
      const { org, bisi } = await world(tx)
      const { client, mailer } = clientAs(tx, org.owner)
      const rule = (await client.approvalRules.list()).items[1]?.rules[0]
      expect(await client.approvalRules.delete({ id: rule?.id ?? '' })).toEqual({
        notice: 'Rule deleted',
      })
      expect((await client.approvalRules.list()).items[1]?.rules).toEqual([])
      expect(mailer.to(bisi.user.email)[0]?.text).toContain('Approved by: Owner')
    }))
})

describe('approval rules: roles named in a rule', () => {
  it('refuses to delete a role used in a rule, in the service and in the database', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      const board = await createCustomRole(tx, org, {
        name: 'Board',
        permissions: { settings: ['view', 'approve'] },
      })
      const { client } = clientAs(tx, org.owner)
      const groups = (await client.approvalRules.list()).items
      const rule = groups[0]?.rules[0]
      await client.approvalRules.update({
        id: rule?.id ?? '',
        version: 1,
        actionKey: 'access.role.update',
        when: { kind: 'any' },
        steps: [[owner, board.id]],
        entityIds: 'all',
      })
      await expect(client.roles.delete({ id: board.id })).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'role_in_rule', count: 1 },
        message: 'Board approves in 1 rule. Change that rule first.',
      })
      await expect(
        tx.transaction((sp) =>
          sp.execute(sql`update ${roles} set archived_at = now() where id = ${board.id}`),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ code: '23514', constraint: 'roles_not_in_rule' }),
      })
    }))
})

describe('approval rules: defaults', () => {
  it('writes the two default rules when an organization is created', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx, { twoFactorEnabled: true })
      await onboard(
        tx,
        { user, sessionId: null },
        { name: 'Vento Homes Ltd', headOfficeState: 'Lagos', financialYearStartMonth: 1 },
      )
      const list = await clientAs(tx, user).client.approvalRules.list()
      expect(list.canEdit).toBe(true)
      expect(list.items.map((g) => g.rules.map((r) => r.chain))).toEqual([
        ['Owner or Admin'],
        ['Owner'],
      ])
    }))
})
