import {
  type ApprovalActionKey,
  isApprovalActionKey,
  type MatchableRule,
  SYSTEM_ROLE_KEYS,
} from '@vento/shared'
import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { rawTimestamp } from '@/db/raw'

export type RuleRole = { id: string; name: string }
export type RuleEntity = { id: string; name: string; archived: boolean }

/** A rule with its steps and companies, as the matcher, the engine and the rules page read it. */
export type LoadedRule = MatchableRule & {
  id: string
  version: number
  /** Step 1 first; each step's roles, built-ins in the default order, then A–Z. */
  steps: RuleRole[][]
  /** 'all', or the named companies A–Z (archived ones kept). */
  entities: 'all' | RuleEntity[]
  updatedAt: Date
}

/** Built-in roles in the default order ("Owner or Admin"), then custom ones. */
export const SYSTEM_ORDER = sql.raw(
  `array[${SYSTEM_ROLE_KEYS.map((k) => `'${k}'`).join(',')}]::text[]`,
)

type RuleRow = {
  id: string
  action_key: string
  min_amount: string | null
  applies_to_all: boolean
  version: number
  updated_at: Date | string
  entities: RuleEntity[] | null
  steps: { position: number; roles: RuleRole[] | null }[] | null
}

/**
 * The organization's rules, for one action or all, in two levels of json so it's one query: the
 * matcher needs every rule of the action at once, and the rules page every rule.
 */
export async function loadRules(
  db: DbOrTx,
  organizationId: string,
  actionKey?: ApprovalActionKey,
  ruleIds?: readonly string[],
): Promise<LoadedRule[]> {
  const byAction = actionKey ? sql` and ar.action_key = ${actionKey}` : sql``
  const byId =
    ruleIds && ruleIds.length > 0
      ? sql` and ar.id in (${sql.join(
          ruleIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``
  const result = await db.execute<RuleRow>(sql`
    select ar.id, ar.action_key, ar.min_amount, ar.applies_to_all, ar.version, ar.updated_at,
      (select json_agg(json_build_object('id', e.id, 'name', e.name,
          'archived', e.status = 'archived') order by lower(e.name), e.id)
        from approval_rule_entities re
        join entities e on e.id = re.entity_id and e.organization_id = re.organization_id
        where re.organization_id = ar.organization_id and re.rule_id = ar.id) as entities,
      (select json_agg(json_build_object('position', s.position, 'roles',
          (select json_agg(json_build_object('id', ro.id, 'name', ro.name)
              order by array_position(${SYSTEM_ORDER}, ro.key) nulls last, lower(ro.name), ro.id)
            from approval_rule_step_roles sr
            join roles ro on ro.id = sr.role_id and ro.organization_id = sr.organization_id
            where sr.organization_id = s.organization_id and sr.step_id = s.id))
          order by s.position)
        from approval_rule_steps s
        where s.organization_id = ar.organization_id and s.rule_id = ar.id) as steps
    from approval_rules ar
    where ar.organization_id = ${organizationId}${byAction}${byId}
    order by ar.action_key, ar.applies_to_all desc, ar.min_amount nulls first, ar.created_at, ar.id
  `)
  return result.rows.flatMap((row) => {
    // A rule for an action a later release removed can't match anything; skip it.
    if (!isApprovalActionKey(row.action_key)) return []
    const entities = row.applies_to_all ? ('all' as const) : (row.entities ?? [])
    return [
      {
        id: row.id,
        actionKey: row.action_key,
        minAmount: row.min_amount,
        version: row.version,
        entityIds: entities === 'all' ? ('all' as const) : entities.map((e) => e.id),
        entities,
        steps: (row.steps ?? []).map((s) => s.roles ?? []),
        updatedAt: rawTimestamp(row.updated_at) ?? new Date(0),
      },
    ]
  })
}
