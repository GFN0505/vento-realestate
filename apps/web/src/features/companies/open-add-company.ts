import type { MePlan } from '@vento/shared'
import { shellUi } from '@/features/shell/shell-ui'

/*
 * Every Add company button (Companies, the switcher, Home's checklist, ⌘K) calls this. Tiny and
 * with no import of the sheet, so Home's first load carries only these lines.
 */

/** Owners only (the server sends `plan` to owners): every active company place is taken. */
export function companyLimitReached(plan: MePlan | null): boolean {
  const limit = plan?.limits.find((l) => l.key === 'entities')
  return limit !== undefined && limit.included !== null && limit.used >= limit.included
}

/**
 * An owner at the limit gets the plan message instead of a form that can't save (spec question
 * 11). Everyone else gets the form; a refusal from the server names the owner.
 */
export function openAddCompany(plan: MePlan | null): void {
  if (companyLimitReached(plan)) shellUi.open('companyPlan')
  else shellUi.openCompany({ mode: 'add' })
}
