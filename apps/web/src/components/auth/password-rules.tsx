import { checkPasswordLocally, PASSWORD_RULE_LABELS } from '@vento/shared'
import { CheckIcon, CircleIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RuleState = 'met' | 'pending' | 'failed'

/** Problems only the server can find; the page sets them from the error code it gets back. */
export type ServerPasswordIssues = { common?: boolean; reused?: boolean }

type Props = {
  password: string
  serverIssues?: ServerPasswordIssues
  /** Reset adds "Different from your last 5 passwords". */
  showReuseRule?: boolean
  /** After a submit, rules still unmet turn rose instead of staying grey. */
  showUnmetAsFailed?: boolean
  id?: string
}

/** Live checklist under a password field (DSAdditions → Password rules). */
export function PasswordRules({
  password,
  serverIssues = {},
  showReuseRule = false,
  showUnmetAsFailed = false,
  id,
}: Props) {
  const local = checkPasswordLocally(password)
  const unmet: RuleState = showUnmetAsFailed ? 'failed' : 'pending'
  const rules: { label: string; state: RuleState }[] = [
    { label: PASSWORD_RULE_LABELS.length, state: local.length ? 'met' : unmet },
    { label: PASSWORD_RULE_LABELS.number, state: local.number ? 'met' : unmet },
    { label: PASSWORD_RULE_LABELS.notCommon, state: serverIssues.common ? 'failed' : 'pending' },
  ]
  if (showReuseRule) {
    rules.push({
      label: PASSWORD_RULE_LABELS.reuse,
      state: serverIssues.reused ? 'failed' : 'pending',
    })
  }

  return (
    <ul id={id} className="flex flex-col gap-1 text-xs">
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
