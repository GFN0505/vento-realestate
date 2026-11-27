import { RPCHandler } from '@orpc/server/fetch'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents } from '@/db/schema'
import { lagosIsoDate } from '@/lib/format'
import { router } from '@/router'
import { withRollback } from '@/test/db'
import { createEntity, createMember, createOrganization, type TestOrg } from '@/test/factories'
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
