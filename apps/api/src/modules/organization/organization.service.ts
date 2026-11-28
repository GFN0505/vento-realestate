import type {
  NigerianState,
  Organization,
  OrganizationSecurity,
  SetTwoStepRequiredInput,
  SetTwoStepRequiredOutput,
  updateOrganizationInput,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, lockViewer, type ServiceContext } from '@/access/context'
import { webUrl } from '@/auth/hooks/deps'
import type { DbOrTx } from '@/db/client'
import { members, organizations, roles, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { twoStepNoLongerRequiredAlert } from '@/email/templates/security-alert'
import { forbidden, notFound } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import { recordAudit } from '@/modules/audit/audit.service'

type OrganizationRow = typeof organizations.$inferSelect

export function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    headOfficeState: row.headOfficeState as NigerianState,
    financialYearStartMonth: row.financialYearStartMonth,
    baseCurrency: 'NGN',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Locks the organization row: serialises owner counts, last-entity checks, role and rule saves
 * and approval decisions (every caller takes this same lock, which conflicts with itself).
 * FOR NO KEY UPDATE, not FOR UPDATE: inserts referencing the organization take FOR KEY SHARE for
 * their foreign key, and FOR UPDATE would block them, so a decision holding this while its
 * execute waits for a parcel deadlocked with a land write inserting under that parcel's lock
 * (review #1). No caller relies on blocking those inserts: every check this serialises is
 * between callers of this function, and the organization's key never changes.
 */
export async function lockOrganization(
  tx: DbOrTx,
  organizationId: string,
): Promise<OrganizationRow> {
  const [row] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for('no key update')
  if (!row) throw notFound()
  return row
}

export async function getOrganization(ctx: ServiceContext): Promise<Organization> {
  const [row] = await ctx.db
    .select()
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId))
  if (!row) throw notFound()
  return toOrganization(row)
}

/** Only changed fields go into before/after, so the audit trail reads as a diff. */
export function diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
  const changed = Object.keys(patch).filter(
    (k) => patch[k as keyof T] !== undefined && patch[k as keyof T] !== before[k as keyof T],
  ) as (keyof T)[]
  return {
    changed,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, patch[k]])),
  }
}

export async function updateOrganization(
  ctx: ServiceContext,
  input: z.output<typeof updateOrganizationInput>,
): Promise<Organization> {
  return ctx.db.transaction(async (tx) => {
    const current = await lockOrganization(tx, ctx.organizationId)
    const change = diff(current, input)
    if (change.changed.length === 0) return toOrganization(current)
    const [row] = await tx
      .update(organizations)
      .set(input)
      .where(eq(organizations.id, ctx.organizationId))
      .returning()
    if (!row) throw notFound()
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'organization.updated',
      actor: actorOf(ctx),
      target: { type: 'organization', id: row.id, label: row.name },
      before: change.before,
      after: change.after,
    })
    return toOrganization(row)
  })
}

/**
 * The setup checklist's "We only have one company" (true), or its Undo (false). A recorded fact
 * about the organization (who and when), audited like any other change to it. A no-op when it
 * already reads that way.
 */
export async function answerSingleCompany(
  ctx: ServiceContext,
  singleCompany: boolean,
): Promise<{ notice: string }> {
  return ctx.db.transaction(async (tx) => {
    const current = await lockOrganization(tx, ctx.organizationId)
    const was = current.singleCompanyConfirmedAt !== null
    const notice = singleCompany ? 'Noted: you have one company' : 'Answer undone'
    if (was === singleCompany) return { notice }
    await tx
      .update(organizations)
      .set(
        singleCompany
          ? { singleCompanyConfirmedAt: new Date(), singleCompanyConfirmedByUserId: ctx.user.id }
          : { singleCompanyConfirmedAt: null, singleCompanyConfirmedByUserId: null },
      )
      .where(eq(organizations.id, ctx.organizationId))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'organization.updated',
      actor: actorOf(ctx),
      target: { type: 'organization', id: current.id, label: current.name },
      before: { singleCompanyConfirmed: was },
      after: { singleCompanyConfirmed: singleCompany },
    })
    return { notice }
  })
}

type SecurityRow = {
  required: boolean
  changed_at: Date | string | null
  changed_by_name: string | null
  people: number
  with_two_step: number
  without_names: string[] | null
  without_count: number
}

/**
 * The Security card: the setting, who changed it, and in one query how many active members have
 * two-step on, with the first three names (A–Z) of those without. Pending invitations don't count:
 * they're told when they accept (plan question 10).
 */
async function readSecurity(db: DbOrTx, organizationId: string): Promise<SecurityRow> {
  const result = await db.execute<SecurityRow>(sql`
    select o.two_step_required_for_everyone as required,
      o.two_step_required_changed_at as changed_at, changer.name as changed_by_name,
      count(m.id)::int as people,
      (count(m.id) filter (where u.two_factor_enabled))::int as with_two_step,
      (array_agg(u.name order by lower(u.name), u.id)
        filter (where m.id is not null and not u.two_factor_enabled))[1:3] as without_names,
      (count(m.id) filter (where not u.two_factor_enabled))::int as without_count
    from organizations o
    left join users changer on changer.id = o.two_step_required_changed_by_user_id
    left join members m on m.organization_id = o.id and m.status = 'active'
    left join users u on u.id = m.user_id
    where o.id = ${organizationId}
    group by o.id, changer.name
  `)
  const row = result.rows[0]
  if (!row) throw notFound()
  return row
}

function toSecurity(row: SecurityRow, canChange: boolean): OrganizationSecurity {
  const names = row.without_names ?? []
  return {
    required: row.required,
    changedAt: row.changed_at ? new Date(row.changed_at).toISOString() : null,
    changedByName: row.changed_by_name,
    withTwoStep: row.with_two_step,
    people: row.people,
    withoutTwoStep: { names, others: Math.max(0, row.without_count - names.length) },
    canChange,
  }
}

const isOwner = (ctx: Pick<ServiceContext, 'member'>) => ctx.member.roleKey === 'owner'

export async function getOrganizationSecurity(ctx: ServiceContext): Promise<OrganizationSecurity> {
  return toSecurity(await readSecurity(ctx.db, ctx.organizationId), isOwner(ctx))
}

/** "Two-step is no longer required for everyone" to every active owner, sent after commit. */
async function noLongerRequiredAlerts(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'organizationName' | 'user'>,
): Promise<EmailMessage[]> {
  const owners = await tx
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, ctx.organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
      ),
    )
  const now = new Date()
  const alert = twoStepNoLongerRequiredAlert({
    byName: ctx.user.name,
    organizationName: ctx.organizationName,
    at: formatTime(now),
    on: formatDate(now),
    organizationUrl: webUrl('/settings/organization'),
  })
  return owners.map((o) => ({ to: o.email, tag: 'security_alert' as const, ...alert }))
}

/**
 * "Require two-step sign-in for everyone", owners only. The organization row is locked first,
 * then the viewer's own membership, so a demotion meanwhile is seen. Asking for the value it
 * already has writes nothing and says who changed it, when that's news to this owner.
 */
export async function setTwoStepRequired(
  ctx: ServiceContext,
  input: SetTwoStepRequiredInput,
): Promise<SetTwoStepRequiredOutput & { emails: EmailMessage[] }> {
  return ctx.db.transaction(async (tx) => {
    const current = await lockOrganization(tx, ctx.organizationId)
    const live = await lockViewer(tx, ctx)
    if (!isOwner(live)) throw forbidden('owner_only', 'Only owners can change this.')
    const was = current.twoStepRequiredForEveryone
    const notice = input.required
      ? `Two-step is now required for everyone in ${current.name}`
      : 'Two-step is no longer required for everyone'
    if (was === input.required) {
      const row = await readSecurity(tx, ctx.organizationId)
      const seen = input.seenChangedAt ? new Date(input.seenChangedAt).getTime() : null
      const changed = current.twoStepRequiredChangedAt?.getTime() ?? null
      const byOther =
        changed !== seen && current.twoStepRequiredChangedByUserId !== ctx.user.id
          ? row.changed_by_name
          : null
      return {
        ...toSecurity(row, true),
        notice,
        changedByOther: byOther ? `${byOther} changed this a moment ago.` : null,
        emails: [],
      }
    }
    await tx
      .update(organizations)
      .set({
        twoStepRequiredForEveryone: input.required,
        twoStepRequiredChangedAt: new Date(),
        twoStepRequiredChangedByUserId: ctx.user.id,
      })
      .where(eq(organizations.id, ctx.organizationId))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'organization.updated',
      actor: actorOf(ctx),
      target: { type: 'organization', id: current.id, label: current.name },
      before: { twoStepRequiredForEveryone: was },
      after: { twoStepRequiredForEveryone: input.required },
    })
    // Turning it on only raises security: the banner and Team tell people (plan question 13).
    const emails = input.required ? [] : await noLongerRequiredAlerts(tx, ctx)
    const row = await readSecurity(tx, ctx.organizationId)
    return { ...toSecurity(row, true), notice, changedByOther: null, emails }
  })
}
