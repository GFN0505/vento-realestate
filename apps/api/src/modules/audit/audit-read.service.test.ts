import { RPCHandler } from '@orpc/server/fetch'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, members } from '@/db/schema'
import { lagosIsoDate } from '@/lib/format'
import { router } from '@/router'
import { withRollback } from '@/test/db'
import {
  createEntity,
  createMember,
  createOrganization,
  createUser,
  type TestOrg,
  type TestUser,
} from '@/test/factories'
import { clientAs, testContext } from '@/test/router-client'
import { recordAudit } from './audit.service'

// Settings → Audit log: the audit table read in plain words, bounded by dates (plan §6.5).

const today = () => lagosIsoDate(new Date())
const daysAgo = (n: number) => lagosIsoDate(new Date(Date.now() - n * 86_400_000))
const lastWeek = () => ({ from: daysAgo(7), to: today() })

async function event(
  tx: DbOrTx,
  org: TestOrg,
  fields: Partial<Parameters<typeof recordAudit>[1]> & { at?: Date } = {},
) {
  await recordAudit(tx, {
    organizationId: org.id,
    action: 'role.updated',
    actor: { userId: org.owner.id, name: 'Olumide Bankole' },
    target: { type: 'role', id: org.roleIds.get('sales'), label: 'Finance manager' },
    before: { permissions: { finance: ['view'] } },
    after: { permissions: { finance: ['view', 'approve'] } },
    ...fields,
  })
}

describe('audit log: reading', () => {
  it('reads each entry in plain words, field by field', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await event(tx, org)
      const { items, total } = await clientAs(tx, org.owner).client.audit.list(lastWeek())
      expect(total).toBe(1)
      expect(items[0]).toMatchObject({
        actor: { name: 'Olumide Bankole', kind: 'person' },
        module: 'settings',
        what: 'Changed role Finance manager',
        changes: [{ label: 'Finance', before: 'View', after: 'View, Approve' }],
      })
    }))

  it('never shows raw codes or JSON: unknown actions and fields read as words', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await tx.insert(auditEvents).values({
        organizationId: org.id,
        actorName: 'System',
        action: 'future.thing_happened',
        targetType: 'thing',
        before: { secretSauce: { nested: true } },
        after: { secretSauce: { nested: false } },
      })
      const [row] = (await clientAs(tx, org.owner).client.audit.list(lastWeek())).items
      expect(row).toMatchObject({
        actor: { kind: 'system' },
        what: 'Made a change',
        changes: [{ label: 'Other details changed', before: null, after: null }],
      })
      expect(JSON.stringify(row)).not.toContain('secretSauce')
    }))

  it('filters by module, person, company and record, inside the dates', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const aisha = await createMember(tx, org, { role: 'admin', name: 'Aisha Bello' })
      await event(tx, org)
      await event(tx, org, {
        action: 'auth.signed_in',
        actor: { userId: aisha.user.id, name: 'Aisha Bello' },
        target: { type: 'user', id: aisha.user.id },
      })
      await event(tx, org, {
        action: 'entity.updated',
        target: { type: 'entity', id: parkview.id, label: parkview.name },
      })
      await event(tx, org, {
        action: 'approval.requested',
        target: { type: 'role', id: org.roleIds.get('viewer') },
        metadata: { entityId: parkview.id },
      })
      await event(tx, org, { at: new Date(Date.now() - 10 * 86_400_000) })
      const { client } = clientAs(tx, org.owner)
      const whats = async (f: object) =>
        (await client.audit.list({ ...lastWeek(), ...f })).items.map((r) => r.what).sort()
      expect(await whats({ module: 'account' })).toEqual(['Signed in'])
      expect(await whats({ actorUserId: aisha.user.id })).toEqual(['Signed in'])
      expect(await whats({ entityId: parkview.id })).toEqual([
        'Asked for approval',
        `Changed company ${parkview.name}`,
      ])
      expect(await whats({ targetType: 'entity', targetId: parkview.id })).toEqual([
        `Changed company ${parkview.name}`,
      ])
      expect((await client.audit.list(lastWeek())).total).toBe(4)
      expect((await client.audit.list({ from: daysAgo(30), to: today() })).total).toBe(5)
    }))

  it('searches names, records and the words of an action, with % and _ as plain characters', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await event(tx, org)
      await event(tx, org, { target: { type: 'role', label: '100% Sales' } })
      const { client } = clientAs(tx, org.owner)
      const count = async (q: string) => (await client.audit.list({ ...lastWeek(), q })).total
      expect(await count('finance manager')).toBe(1)
      expect(await count('olumide')).toBe(2)
      expect(await count('changed a role')).toBe(2)
      expect(await count('100%')).toBe(1)
      expect(await count('%')).toBe(1)
      expect(await count('_')).toBe(0)
    }))

  it('needs a date range of at most a year', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { client } = clientAs(tx, org.owner)
      await expect(
        client.audit.list({ to: today() } as unknown as Parameters<typeof client.audit.list>[0]),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(client.audit.list({ from: daysAgo(400), to: today() })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    }))

  it('opens an entry with the approvals behind it and a link to the record', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await event(tx, org, { metadata: { noApprover: true } })
      const { client } = clientAs(tx, org.owner)
      const [row] = (await client.audit.list(lastWeek())).items
      const detail = await client.audit.get({ id: row?.id ?? '' })
      expect(detail).toMatchObject({
        record: { label: 'Finance manager', link: `/settings/roles/${org.roleIds.get('sales')}` },
        approvedBy: [],
        noApprover: true,
        approvalRequestId: null,
      })
    }))

  it('refuses people without Settings edit or without every company', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const viewer = await createMember(tx, org, { role: 'viewer' })
      const limited = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      await expect(clientAs(tx, viewer.user).client.audit.list(lastWeek())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'permission' },
      })
      await expect(
        clientAs(tx, limited.user).client.audit.export(lastWeek()),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'all_entities_required' },
      })
    }))
})

/** An account event about `about`, done by `by`, written straight into `org`'s trail. */
async function accountEvent(tx: DbOrTx, org: TestOrg, by: TestUser, about: TestUser) {
  await tx.insert(auditEvents).values({
    organizationId: org.id,
    actorUserId: by.id,
    actorName: by.name,
    action: 'two_step.reset',
    targetType: 'user',
    targetId: about.id,
    targetLabel: about.name,
    ipMasked: '102.89.34.x',
    userAgentSummary: 'Chrome on Mac',
  })
}

describe('audit log: people from outside the organization (security L1)', () => {
  it('shows an admin of another organization neutrally, without device or IP address', () =>
    withRollback(async (tx) => {
      const [mine, theirs] = [await createOrganization(tx), await createOrganization(tx)]
      const ada = await createMember(tx, theirs, { role: 'admin', name: 'Ada Okafor' })
      const both = await createMember(tx, mine, { role: 'sales', name: 'Kunle Ojo' })
      await createMember(tx, theirs, { role: 'sales', user: both.user })
      await accountEvent(tx, mine, ada.user, both.user)
      const { client } = clientAs(tx, mine.owner)
      const { items } = await client.audit.list(lastWeek())
      expect(items[0]).toMatchObject({
        actor: {
          userId: null,
          name: 'An admin in another organization',
          kind: 'other_organization',
        },
        what: "Reset Kunle Ojo's two-step sign-in",
        device: null,
        ipMasked: null,
      })
      expect(JSON.stringify(await client.audit.get({ id: items[0]?.id ?? '' }))).not.toContain(
        'Ada',
      )
      expect((await client.audit.list({ ...lastWeek(), q: 'Ada Okafor' })).total).toBe(0)
    }))

  it('shows Vento Real Estate staff as Vento Real Estate, and members as themselves', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const staff = await createUser(tx, { name: 'Tunde Staff', accountKind: 'staff' })
      const kunle = await createMember(tx, org, { role: 'sales', name: 'Kunle Ojo' })
      await accountEvent(tx, org, staff, kunle.user)
      await accountEvent(tx, org, org.owner, kunle.user)
      const { items } = await clientAs(tx, org.owner).client.audit.list(lastWeek())
      expect(items.map((i) => [i.actor.name, i.actor.kind, i.device])).toEqual(
        expect.arrayContaining([
          ['Vento Real Estate', 'vento', null],
          ['Olumide Bankole', 'person', 'Chrome on Mac'],
        ]),
      )
    }))
})

describe('audit log: the Person filter (review S3)', () => {
  it('lists members who acted in the dates, removed ones too, and nobody from outside', () =>
    withRollback(async (tx) => {
      const [org, theirs] = [await createOrganization(tx), await createOrganization(tx)]
      const grace = await createMember(tx, org, { role: 'sales', name: 'Grace Umeh' })
      const idle = await createMember(tx, org, { role: 'sales', name: 'Idle Person' })
      const old = await createMember(tx, org, { role: 'sales', name: 'Bayo Old' })
      const ada = await createMember(tx, theirs, { role: 'admin', name: 'Ada Okafor' })
      await event(tx, org)
      await event(tx, org, { actor: { userId: grace.user.id, name: 'Grace Umeh' } })
      await event(tx, org, {
        actor: { userId: old.user.id, name: 'Bayo Old' },
        at: new Date(Date.now() - 30 * 86_400_000),
      })
      await accountEvent(tx, org, ada.user, idle.user)
      await tx
        .update(members)
        .set({ status: 'removed', removedAt: new Date() })
        .where(eq(members.id, grace.member.id))
      const { client } = clientAs(tx, org.owner)
      const people = await client.audit.people(lastWeek())
      expect(people).toEqual({
        items: [
          { userId: grace.user.id, name: 'Grace Umeh', removed: true },
          { userId: org.owner.id, name: 'Olumide Bankole', removed: false },
        ],
        page: 1,
        pageSize: 25,
        total: 2,
      })
      const found = await client.audit.people({ ...lastWeek(), q: 'grace', pageSize: 1 })
      expect(found.items.map((p) => p.name)).toEqual(['Grace Umeh'])
      expect((await client.audit.people({ ...lastWeek(), page: 3 })).total).toBe(2)
    }))

  it('refuses people who cannot see the audit log', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const viewer = await createMember(tx, org, { role: 'viewer' })
      await expect(clientAs(tx, viewer.user).client.audit.people(lastWeek())).rejects.toMatchObject(
        { code: 'FORBIDDEN' },
      )
    }))
})

describe('audit log: export', () => {
  it('exports the filtered rows as CSV, escaping formulas, and records the export', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      // A name is user input: one that a spreadsheet would run as a formula opens as text.
      await event(tx, org, { actor: { userId: null, name: '=HYPERLINK("http://x")' } })
      const file = await clientAs(tx, org.owner).client.audit.export(lastWeek())
      expect(file.name).toBe(`audit-log-${daysAgo(7)}-to-${today()}.csv`)
      expect(file.type).toBe('text/csv;charset=utf-8')
      // A byte-order mark first, so Excel reads UTF-8 (text() drops it when decoding).
      expect([...new Uint8Array(await file.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const lines = (await file.text()).split('\r\n')
      expect(lines[0]).toBe('"When","Who","Module","What","Changes","Device","IP address"')
      expect(lines[1]).toContain(
        `,"'=HYPERLINK(""http://x"")","Settings","Changed role Finance manager"`,
      )
      const [exported] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, 'audit.exported')),
        )
      expect(exported?.metadata).toMatchObject({ count: 1, filters: lastWeek() })
    }))

  it('sends the file over RPC as a download with its name and type', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await event(tx, org)
      const handler = new RPCHandler(router)
      const { response } = await handler.handle(
        new Request('http://api.test/rpc/audit/export', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ json: lastWeek() }),
        }),
        { prefix: '/rpc', context: testContext(tx, org.owner) },
      )
      expect(response?.status).toBe(200)
      const form = await response?.formData()
      const file = form?.get('0')
      expect(file).toBeInstanceOf(File)
      expect((file as File).name).toMatch(/^audit-log-.*\.csv$/)
      expect(await (file as File).text()).toContain('Changed role Finance manager')
    }))

  it('refuses more than 50,000 rows with the count', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await tx.execute(sql`
        insert into audit_events (organization_id, actor_name, action, target_type)
        select ${org.id}, 'System', 'auth.signed_in', 'user' from generate_series(1, 50001)`)
      await expect(clientAs(tx, org.owner).client.audit.export(lastWeek())).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'too_many_rows', count: 50001 },
        message: 'Narrow the dates to export. This view has 50,001 entries.',
      })
    }))
})
