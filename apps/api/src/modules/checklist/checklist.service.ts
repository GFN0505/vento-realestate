import type { Checklist } from '@vento/shared'
import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import { rawTimestamp } from '@/db/raw'
import { members } from '@/db/schema'
import { lagosIsoDate } from '@/lib/format'
import {
  CHECKLIST_ITEMS,
  type ChecklistEntry,
  type ChecklistFacts,
  evaluateChecklist,
} from './items'

type FactsRow = {
  has_entity: boolean | null
  first_entity_name: string | null
  entity_count: number
  single_company_confirmed: boolean | null
  other_members: number
  first_other_name: string | null
  invited_people: number
  viewer_two_step_on: boolean | null
  hidden_at: Date | string | null
  completed_at: Date | string | null
}

/** A viewer limited to some entities only ever reads names inside their limit. */
function withinViewerLimit(ctx: ServiceContext): SQL {
  const limit = ctx.member.entityIds
  if (limit === null) return sql``
  if (!limit.length) return sql` and false`
  return sql` and id in (${sql.join(
    limit.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
}

/** Everything the items read, counted in the active organization only, in one statement. */
async function loadFacts(ctx: ServiceContext) {
  const org = ctx.organizationId
  const result = await ctx.db.execute<FactsRow>(sql`
    select
      exists (select 1 from entities where organization_id = ${org} and status = 'active')
        as has_entity,
      (select name from entities where organization_id = ${org} and status = 'active'${withinViewerLimit(ctx)}
        order by created_at, id limit 1) as first_entity_name,
      (select count(*) from entities where organization_id = ${org})::int as entity_count,
      (select single_company_confirmed_at is not null from organizations where id = ${org})
        as single_company_confirmed,
      (select count(*) from members where organization_id = ${org} and status = 'active'
        and user_id <> ${ctx.user.id})::int as other_members,
      (select u.name from members o join users u on u.id = o.user_id
        where o.organization_id = ${org} and o.status = 'active' and o.user_id <> ${ctx.user.id}
        order by o.joined_at, o.id limit 1) as first_other_name,
      (select count(distinct email) from invitations where organization_id = ${org})::int
        as invited_people,
      (select two_factor_enabled from users where id = ${ctx.user.id}) as viewer_two_step_on,
      m.checklist_hidden_at as hidden_at, m.checklist_completed_at as completed_at
    from members m
    where m.organization_id = ${org} and m.id = ${ctx.member.id}
  `)
  const row = result.rows[0]
  const facts: ChecklistFacts = {
    organizationName: ctx.organizationName,
    hasEntity: Boolean(row?.has_entity),
    firstEntityName: row?.first_entity_name ?? null,
    entityCount: row?.entity_count ?? 0,
    singleCompanyConfirmed: Boolean(row?.single_company_confirmed),
    viewerTwoStepOn: Boolean(row?.viewer_two_step_on),
    otherMembers: row?.other_members ?? 0,
    firstOtherName: row?.first_other_name ?? null,
    invitedPeople: row?.invited_people ?? 0,
  }
  return {
    facts,
    hiddenAt: rawTimestamp(row?.hidden_at),
    completedAt: rawTimestamp(row?.completed_at),
  }
}

const ownRow = (ctx: ServiceContext) =>
  and(eq(members.organizationId, ctx.organizationId), eq(members.id, ctx.member.id))

// Checklist state is the person's view of Home, not a change to the member: updated_at stays
// put, as for last active.
const keepUpdatedAt = { updatedAt: sql`${members.updatedAt}` }

/**
 * The Home card. When everything is done the card stays for the rest of that Lagos day, then
 * goes; an item that opens again (a later brick adds one) brings it back, unless the person hid
 * it. Writes only when the all-done state flips.
 */
export async function getChecklist(
  ctx: ServiceContext,
  now = new Date(),
  registry: readonly ChecklistEntry[] = CHECKLIST_ITEMS,
): Promise<Checklist> {
  const { facts, hiddenAt, completedAt } = await loadFacts(ctx)
  const items = evaluateChecklist(registry, (key) => ctx.features.has(key), facts, {
    allEntities: ctx.member.entityIds === null,
  })
  const allDone = items.every((i) => i.done)
  let completed = completedAt
  if (allDone && !completed) {
    completed = now
    await ctx.db
      .update(members)
      .set({ checklistCompletedAt: now, ...keepUpdatedAt })
      .where(and(ownRow(ctx), sql`${members.checklistCompletedAt} is null`))
  } else if (!allDone && completed) {
    completed = null
    await ctx.db
      .update(members)
      .set({ checklistCompletedAt: null, ...keepUpdatedAt })
      .where(ownRow(ctx))
  }
  const doneBeforeToday = completed !== null && lagosIsoDate(completed) < lagosIsoDate(now)
  const hidden = hiddenAt !== null
  return { shown: !hidden && !doneBeforeToday, hidden, items, allDone }
}

/** For this person on every device. Not audited: it changes how Home looks, not any data. */
export async function hideChecklist(ctx: ServiceContext): Promise<{ notice: string }> {
  await ctx.db
    .update(members)
    .set({ checklistHiddenAt: new Date(), ...keepUpdatedAt })
    .where(ownRow(ctx))
  return { notice: 'Checklist hidden' }
}

export async function showChecklist(ctx: ServiceContext): Promise<{ notice: string }> {
  await ctx.db
    .update(members)
    .set({ checklistHiddenAt: null, ...keepUpdatedAt })
    .where(ownRow(ctx))
  return { notice: 'Checklist shown' }
}
