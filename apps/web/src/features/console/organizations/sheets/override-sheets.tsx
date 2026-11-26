import { useId, useState } from 'react'
import { consoleClient } from '../../api'
import { ChangeSheet } from '../../changes/change-sheet'
import { useChange } from '../../changes/use-change'
import { overrideWhat } from '../override-words'
import { useOrganizationSearch } from '../use-organization-search'
import type { SheetProps } from './organization-changes'
import {
  initialDraft,
  type OverrideDraft,
  type OverrideErrors,
  type OverrideInput,
  overrideConfirmLabel,
  readDraft,
} from './override-draft'
import { OverrideFields } from './override-fields'

const set = consoleClient.console.organizations.setOverride
const clear = consoleClient.console.organizations.clearOverride

/** Add override (spec): kind, feature or limit, value, until; prefilled from a Features row. */
export function OverrideSheet({ org, onClose, onNext }: SheetProps) {
  const { search } = useOrganizationSearch()
  const [initial] = useState(() => initialDraft(search))
  const [draft, setDraft] = useState<OverrideDraft>(initial)
  const [errors, setErrors] = useState<OverrideErrors>({})
  const [input, setInput] = useState<OverrideInput | null>(null)
  const ids = { target: useId(), value: useId(), until: useId() }
  const change = useChange(set, onClose)
  return (
    <ChangeSheet
      open
      onClose={onClose}
      onNext={onNext}
      change={change}
      title="Add override"
      description={org.name}
      reviewTitle="Add this override?"
      confirmLabel={input ? overrideConfirmLabel(input) : 'Add override'}
      fieldsDirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onReview={() => {
        const read = readDraft(draft, org.id)
        if (read.errors) {
          setErrors(read.errors)
          const first = (['target', 'value', 'until'] as const).find((k) => read.errors[k])
          if (first) document.getElementById(ids[first])?.focus()
          return
        }
        setErrors({})
        setInput(read.input)
        void change.preview(read.input)
      }}
      fields={
        <OverrideFields
          draft={draft}
          errors={errors}
          ids={ids}
          set={(patch) => {
            setDraft((d) => ({ ...d, ...patch }))
            setErrors({})
          }}
        />
      }
    />
  )
}

/** Clear override: no fields; the preview says what applies after. */
export function ClearOverrideSheet({ org, onClose }: SheetProps) {
  const { search } = useOrganizationSearch()
  const override = org.overrides.find((o) => o.kind === search.kind && o.key === search.key)
  const change = useChange(clear, onClose)
  return (
    <ChangeSheet
      open
      onClose={onClose}
      change={change}
      title={override ? `Clear ${overrideWhat(override)}?` : 'Clear override'}
      description={org.name}
      confirmLabel="Clear override"
      destructive
      notice={override ? undefined : 'This override has already ended. Nothing to clear.'}
      autoPreview={() => {
        if (!override) return
        void change.preview(
          override.kind === 'limit'
            ? { organizationId: org.id, kind: 'limit', key: override.key }
            : { organizationId: org.id, kind: override.kind, key: override.key },
        )
      }}
    />
  )
}
