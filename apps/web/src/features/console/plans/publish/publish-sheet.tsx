import type { PlanDetail } from '@vento/shared/console'
import { useId, useState } from 'react'
import { consoleClient } from '../../api'
import { ChangeSheet } from '../../changes/change-sheet'
import { useChange } from '../../changes/use-change'
import {
  initialPublishDraft,
  PUBLISH_FIELD_ORDER,
  type PublishDraft,
  type PublishErrors,
  readPublishDraft,
} from './publish-draft'
import { PublishFields } from './publish-fields'

const publish = consoleClient.console.plans.publish

/**
 * Publish new version (spec, stepped sheet): features and limits starting from the latest
 * version → the review (added and removed, who stays on the old version) → reason → **Publish
 * Growth v3**. `plan: null` publishes a new plan with its own key and name.
 */
export function PublishSheet({ plan, onClose }: { plan: PlanDetail | null; onClose: () => void }) {
  const [initial] = useState(() => initialPublishDraft(plan))
  const [draft, setDraft] = useState<PublishDraft>(initial)
  const [errors, setErrors] = useState<PublishErrors>({})
  const ids = {
    key: useId(),
    name: useId(),
    features: useId(),
    entities: useId(),
    members: useId(),
    aiBudget: useId(),
    sortOrder: useId(),
  }
  const change = useChange(publish, onClose)
  const isNew = plan === null
  const next = plan ? Math.max(...plan.versions.map((v) => v.version)) + 1 : 1
  const label = `${draft.name.trim() || 'the plan'}${isNew ? '' : ` v${next}`}`

  return (
    <ChangeSheet
      open
      onClose={onClose}
      change={change}
      title={isNew ? 'New plan' : `Publish ${plan.name} v${next}`}
      description={
        isNew ? 'Organizations join it only when you move them.' : 'Publishing moves nobody.'
      }
      reviewTitle={`Publish ${label}?`}
      confirmLabel={`Publish ${label}`}
      fieldsDirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onReview={() => {
        const read = readPublishDraft(draft)
        if (read.errors) {
          setErrors(read.errors)
          const first = PUBLISH_FIELD_ORDER.find((field) => read.errors[field])
          if (first) document.getElementById(ids[first])?.focus()
          return
        }
        setErrors({})
        void change.preview({ ...read.definition, isNew })
      }}
      fields={
        <PublishFields
          draft={draft}
          errors={errors}
          isNew={isNew}
          ids={ids}
          set={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
      }
    />
  )
}
