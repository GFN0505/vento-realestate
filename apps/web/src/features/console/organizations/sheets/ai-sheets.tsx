import { aiBudget } from '@vento/shared/console'
import { useId, useState } from 'react'
import { consoleClient } from '../../api'
import { ChangeSheet } from '../../changes/change-sheet'
import { cleanNaira, NairaField } from '../../changes/naira-field'
import { type ChangeController, useChange } from '../../changes/use-change'
import { naira } from '../../words'
import type { SheetProps } from './organization-changes'

const add = consoleClient.console.organizations.addAi
const changeBudget = consoleClient.console.organizations.changeAiBudget
const remove = consoleClient.console.organizations.removeAi
const DEFAULT_BUDGET = '150,000'

/** The budget field's check, the shared rule's own message ("Enter a monthly budget above ₦0"). */
function budgetProblem(text: string): string | null {
  const parsed = aiBudget.safeParse(cleanNaira(text))
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Enter a monthly budget')
}

function useBudget(initial: string) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  return {
    id,
    text,
    error,
    dirty: text !== initial,
    setText(value: string) {
      setText(value)
      if (error && !budgetProblem(value)) setError(null)
    },
    blur: () => text.trim() !== '' && setError(budgetProblem(text)),
    /** The amount to send, or null (with the field's message and focus). */
    take(): string | null {
      const problem = budgetProblem(text)
      setError(problem)
      if (problem) document.getElementById(id)?.focus()
      return problem ? null : cleanNaira(text)
    },
  }
}

/** Add AI (spec): ₦150,000 a month prefilled. */
export function AddAiSheet(props: SheetProps) {
  const change = useChange(add, props.onClose)
  return <AiBudgetSheet {...props} mode="add" change={change} />
}

/** Change AI budget: one step for the super-admin, the current budget prefilled. */
export function ChangeAiBudgetSheet(props: SheetProps) {
  const change = useChange(changeBudget, props.onClose)
  return <AiBudgetSheet {...props} mode="change" change={change} />
}

type BudgetChange = ChangeController & {
  preview: (input: { organizationId: string; budget: string }) => Promise<boolean>
}

function AiBudgetSheet({
  org,
  onClose,
  onNext,
  mode,
  change,
}: SheetProps & { mode: 'add' | 'change'; change: BudgetChange }) {
  const current = org.addOns.find((a) => a.key === 'ai')
  const budget = useBudget(current ? naira(current.budget).slice(1) : DEFAULT_BUDGET)
  const amount = naira(cleanNaira(budget.text) || '0')
  return (
    <ChangeSheet
      open
      onClose={onClose}
      onNext={onNext}
      change={change}
      title={mode === 'add' ? 'Add AI' : 'Change AI budget'}
      description={org.name}
      reviewTitle={
        mode === 'add'
          ? `Add AI at ${amount} a month?`
          : `Change the AI budget to ${amount} a month?`
      }
      confirmLabel={mode === 'add' ? 'Add AI' : `Change to ${amount}`}
      fieldsDirty={budget.dirty}
      onReview={() => {
        const value = budget.take()
        if (value) void change.preview({ organizationId: org.id, budget: value })
      }}
      fields={
        <NairaField
          id={budget.id}
          label="Monthly budget"
          value={budget.text}
          onChange={budget.setText}
          onBlur={budget.blur}
          error={budget.error}
          help="In naira, each month. AI features pause when it's used up."
        />
      }
    />
  )
}

/** Remove AI: no fields; the preview names the AI features that stop. */
export function RemoveAiSheet({ org, onClose }: SheetProps) {
  const change = useChange(remove, onClose)
  return (
    <ChangeSheet
      open
      onClose={onClose}
      change={change}
      title={`Remove AI from ${org.name}?`}
      confirmLabel="Remove AI"
      destructive
      autoPreview={() => void change.preview({ organizationId: org.id })}
    />
  )
}
