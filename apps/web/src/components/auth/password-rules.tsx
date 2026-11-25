import {
  checkPasswordLocally,
  PASSWORD_RULE_KEYS,
  PASSWORD_RULE_LABELS,
  type PasswordRuleKey,
  unmetPasswordRules,
} from '@vento/shared'
import { CheckIcon, CircleIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RuleState = 'met' | 'pending' | 'failed'

/** What the server refused; the page sets it from the error code it gets back. */
export type ServerPasswordIssues = { rule?: PasswordRuleKey; reused?: boolean }

/** True when the browser can't find anything wrong (the server still checks reuse). */
export function meetsLocalRules(password: string): boolean {
  return unmetPasswordRules(password).length === 0
}

type Props = {
  password: string
  serverIssues?: ServerPasswordIssues | undefined
  /** Reset adds "Different from your last 5 passwords". */
  showReuseRule?: boolean
  /** After a submit, rules still unmet turn rose instead of staying grey. */
  showUnmetAsFailed?: boolean
  id?: string
}

/** Live checklist under a password field (DSAdditions → Password rules), two columns from md. */
export function PasswordRules({
  password,
  serverIssues = {},
  showReuseRule = false,
  showUnmetAsFailed = false,
  id,
}: Props) {
  const checks = checkPasswordLocally(password)
  const unmet: RuleState = showUnmetAsFailed ? 'failed' : 'pending'
  const rules: { label: string; state: RuleState }[] = PASSWORD_RULE_KEYS.map((key) => ({
    label: PASSWORD_RULE_LABELS[key],
    state: serverIssues.rule === key ? 'failed' : checks[key] ? 'met' : unmet,
  }))
  if (showReuseRule) {
    rules.push({
      label: PASSWORD_RULE_LABELS.reuse,
      state: serverIssues.reused ? 'failed' : 'pending',
    })
  }

  return (
    <ul id={id} className="grid gap-x-4 gap-y-1 text-xs md:grid-cols-2">
      {rules.map((rule) => (
        <li
          key={rule.label}
          data-state={rule.state}
          className={cn(
            'flex items-center gap-1.5',
            rule.state === 'met' && 'text-status-emerald-fg',
            rule.state === 'pending' && 'text-muted-foreground',
            rule.state === 'failed' && 'text-destructive',
          )}
        >
          <RuleIcon state={rule.state} />
          <span className="sr-only">{STATUS_TEXT[rule.state]}</span>
          {rule.label}
        </li>
      ))}
    </ul>
  )
}

const STATUS_TEXT: Record<RuleState, string> = {
  met: 'Done:',
  pending: 'Not yet:',
  failed: 'Not met:',
}

function RuleIcon({ state }: { state: RuleState }) {
  if (state === 'met') return <CheckIcon className="size-3.5" strokeWidth={2.5} aria-hidden />
  if (state === 'failed') return <XIcon className="size-3.5" strokeWidth={2.5} aria-hidden />
  return <CircleIcon className="size-3" strokeWidth={2} aria-hidden />
}
