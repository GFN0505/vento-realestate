/*
 * The Approval rules address: `/settings/approval-rules?rule=new` or `?rule=<id>` opens the rule
 * sheet, so Back closes it and ⌘K or a link can open it. Hand-written: no zod in the entry.
 */
import { uuidParam } from '@/lib/search-params'

export type RulesSearch = { rule?: string }

export function validateRulesSearch(search: Record<string, unknown>): RulesSearch {
  const rule = search.rule === 'new' ? 'new' : uuidParam(search.rule)
  return rule ? { rule } : {}
}
