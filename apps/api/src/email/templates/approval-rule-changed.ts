import type { RenderedEmail } from './layout'
import { renderEmail } from './layout'

export type RuleChangeLine = { label: string; before: string | null; after: string | null }

/**
 * To every other owner when an approval rule is added, changed or deleted (plan question 4): a
 * new company rule can loosen an all-company one, so every change is worth a look.
 */
export function approvalRuleChangedEmail(p: {
  byName: string
  organizationName: string
  /** "added", "changed" or "deleted". */
  verb: 'added' | 'changed' | 'deleted'
  /** "Change a role's permissions". */
  actionLabel: string
  lines: readonly RuleChangeLine[]
  at: string
  on: string
  url: string
}): RenderedEmail {
  const subject = `Vento Real Estate: ${p.byName} changed an approval rule in ${p.organizationName}`
  return renderEmail(subject, 'An approval rule changed', [
    {
      kind: 'p',
      text: `${p.byName} ${p.verb} the approval rule for “${p.actionLabel}” in ${p.organizationName} at ${p.at} on ${p.on}.`,
    },
    ...p.lines.map((l) => ({
      kind: 'p' as const,
      text:
        p.verb === 'changed'
          ? `${l.label}: ${l.before ?? '—'} → ${l.after ?? '—'}`
          : `${l.label}: ${(p.verb === 'deleted' ? l.before : l.after) ?? '—'}`,
    })),
    { kind: 'button', label: 'Review approval rules', url: p.url },
    {
      kind: 'small',
      text: "You're getting this because you're an owner. If you didn't expect this change, talk to the other owners.",
    },
  ])
}
