import {
  type ApprovalActionKey,
  type ApprovalRuleInput,
  type ApprovalRuleRow,
  approvalRuleInput,
  RULE_ACTION_KEYS,
} from '@vento/shared'
import type { FieldErrors, Resolver } from 'react-hook-form'
import type { EntityAccessValue } from '@/features/team/entity-access-field'

/** The rule sheet's fields. Steps hold role ids, one array per step, in order. */
export type RuleValues = {
  actionKey: ApprovalActionKey
  whenKind: 'any' | 'over'
  /** Naira, as typed ("5,000,000"); commas are dropped before validating. */
  amount: string
  steps: string[][]
  companies: EntityAccessValue
}

/** A new rule: the first action, any amount, one empty step, all companies. */
export function newRuleValues(): RuleValues {
  return {
    actionKey: RULE_ACTION_KEYS[0] ?? 'access.role.update',
    whenKind: 'any',
    amount: '',
    steps: [[]],
    companies: { mode: 'all', ids: [] },
  }
}

export function ruleValues(row: ApprovalRuleRow): RuleValues {
  return {
    actionKey: row.actionKey,
    whenKind: row.minAmount === null ? 'any' : 'over',
    amount: row.minAmount ?? '',
    steps: row.steps.map((step) => step.roles.map((role) => role.id)),
    companies:
      row.entities === 'all'
        ? { mode: 'all', ids: [] }
        : { mode: 'some', ids: row.entities.map((e) => e.id) },
  }
}

/** What `approvalRules.create` takes for the fields. */
export function ruleInput(values: RuleValues): ApprovalRuleInput {
  return {
    actionKey: values.actionKey,
    when:
      values.whenKind === 'any'
        ? { kind: 'any' }
        : { kind: 'over', amount: values.amount.replace(/[,\s₦]/g, '') },
    steps: values.steps,
    entityIds: values.companies.mode === 'all' ? 'all' : [...values.companies.ids],
  }
}

const FIELD: Record<string, keyof RuleValues> = {
  actionKey: 'actionKey',
  when: 'amount',
  steps: 'steps',
  entityIds: 'companies',
}

/** Validates through the shared schema; each issue lands on the field it's about. */
export const ruleResolver: Resolver<RuleValues> = async (values) => {
  const parsed = approvalRuleInput.safeParse(ruleInput(values))
  if (parsed.success) return { values, errors: {} }
  const errors: FieldErrors<RuleValues> = {}
  for (const issue of parsed.error.issues) {
    const field = FIELD[String(issue.path[0])] ?? 'actionKey'
    errors[field] ??= { type: 'validate', message: issue.message }
  }
  return { values: {}, errors }
}
