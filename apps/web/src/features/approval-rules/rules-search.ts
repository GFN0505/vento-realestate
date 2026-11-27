/*
 * The Approval rules address: `/settings/approval-rules?rule=new` or `?rule=<id>` opens the rule
 * sheet, so Back closes it and ⌘K or a link can open it. Hand-written: no zod in the entry.
 */
export type RulesSearch = { rule?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateRulesSearch(search: Record<string, unknown>): RulesSearch {
  const rule = search.rule
  return rule === 'new' || (typeof rule === 'string' && UUID.test(rule)) ? { rule } : {}
}
