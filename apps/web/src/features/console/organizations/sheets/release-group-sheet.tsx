import type { ReleaseGroup } from '@vento/shared'
import { useState } from 'react'
import { consoleClient } from '../../api'
import { ChangeSheet } from '../../changes/change-sheet'
import { ChoiceList } from '../../changes/choice-list'
import { useChange } from '../../changes/use-change'
import { GROUP_LABEL } from '../../words'
import type { SheetProps } from './organization-changes'

const procedures = consoleClient.console.organizations.changeReleaseGroup

const CHOICES: { value: ReleaseGroup; label: string; note: string }[] = [
  { value: 'standard', label: 'Standard', note: 'Gets features once they are on for everyone.' },
  { value: 'pilot', label: 'Pilot', note: 'Also gets features at pilot (early access).' },
  {
    value: 'internal',
    label: 'Internal',
    note: "Every feature, no limits. Only for Vento's own organizations.",
  },
]

/** Change release group (spec): Standard / Pilot / Internal, the current one preselected. */
export function ReleaseGroupSheet({ org, onClose, onNext }: SheetProps) {
  const [group, setGroup] = useState<ReleaseGroup>(org.releaseGroup)
  const change = useChange(procedures, onClose)
  const label = GROUP_LABEL[group]
  return (
    <ChangeSheet
      open
      onClose={onClose}
      onNext={onNext}
      change={change}
      title="Change release group"
      description={org.name}
      reviewTitle={`Move ${org.name} to ${label.toLowerCase()}?`}
      confirmLabel={`Move to ${label.toLowerCase()}`}
      fieldsDirty={group !== org.releaseGroup}
      onReview={() => void change.preview({ organizationId: org.id, group })}
      fields={
        <ChoiceList
          legend="Release group"
          value={group}
          onChange={setGroup}
          choices={CHOICES.map((c) => ({
            ...c,
            note: c.value === org.releaseGroup ? `Current · ${c.note}` : c.note,
          }))}
        />
      }
    />
  )
}
