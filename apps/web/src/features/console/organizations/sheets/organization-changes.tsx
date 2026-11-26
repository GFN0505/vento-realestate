import type { OrganizationDetail } from '@vento/shared/console'
import type { ChangeNext } from '../../changes/change-errors'
import { useOrganizationSearch } from '../use-organization-search'
import { AddAiSheet, ChangeAiBudgetSheet, RemoveAiSheet } from './ai-sheets'
import { ChangePlanSheet } from './change-plan-sheet'
import { ClearOverrideSheet, OverrideSheet } from './override-sheets'
import { ReleaseGroupSheet } from './release-group-sheet'
import { EndTrialSheet, StartTrialSheet } from './trial-sheets'

export type SheetProps = {
  org: OrganizationDetail
  onClose: () => void
  /** A refusal's next step ("End trial") opens that sheet instead. */
  onNext?: (next: ChangeNext) => void
}

const SHEETS = {
  plan: ChangePlanSheet,
  'start-trial': StartTrialSheet,
  'end-trial': EndTrialSheet,
  'add-ai': AddAiSheet,
  'ai-budget': ChangeAiBudgetSheet,
  'remove-ai': RemoveAiSheet,
  group: ReleaseGroupSheet,
  override: OverrideSheet,
  'clear-override': ClearOverrideSheet,
} as const

/**
 * The open change, from the address (`?change=plan`), so Back closes it and a link opens it.
 * Each sheet mounts fresh, so a new change never inherits the last one's reason or key.
 */
export function OrganizationChanges({ org }: { org: OrganizationDetail }) {
  const { search, openChange, closeChange } = useOrganizationSearch()
  if (!search.change) return null
  const Sheet = SHEETS[search.change]
  return (
    <Sheet
      key={`${search.change}:${search.kind ?? ''}:${search.key ?? ''}`}
      org={org}
      onClose={closeChange}
      onNext={(next) => openChange(next === 'end_trial' ? 'end-trial' : 'ai-budget')}
    />
  )
}
