import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { NativeSelect } from '@/components/native-select'
import { Field, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { consoleClient } from '../../api'
import { ChangeSheet } from '../../changes/change-sheet'
import { ChoiceList } from '../../changes/choice-list'
import { useChange } from '../../changes/use-change'
import { plansQuery } from '../../plans/queries'
import { plural } from '../../words'
import type { SheetProps } from './organization-changes'

const procedures = consoleClient.console.organizations.changePlan

/** Change plan (spec): the current plan preselected, latest version; older ones under More. */
export function ChangePlanSheet({ org, onClose, onNext }: SheetProps) {
  const plans = useQuery(plansQuery()).data
  const sorted = [...(plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const initial = org.plan?.key ?? sorted.find((p) => p.defaultForNew)?.key
  const [planKey, setPlanKey] = useState<string | undefined>(undefined)
  const [version, setVersion] = useState<number | undefined>(undefined)
  const [more, setMore] = useState(false)
  const versionId = useId()
  const chosen = planKey ?? initial
  const plan = sorted.find((p) => p.key === chosen)
  const change = useChange(procedures, onClose)

  return (
    <ChangeSheet
      open
      onClose={onClose}
      onNext={onNext}
      change={change}
      title={org.plan ? 'Change plan' : 'Choose a plan'}
      description={org.name}
      reviewTitle={plan ? `Move ${org.name} to ${plan.name}?` : undefined}
      confirmLabel={plan ? `Move to ${plan.name}` : 'Move'}
      fieldsDirty={planKey !== undefined || version !== undefined}
      onReview={() => {
        if (chosen) void change.preview({ organizationId: org.id, planKey: chosen, version })
      }}
      fields={
        !plans ? (
          <div aria-hidden className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <ChoiceList
              legend="Plan"
              value={chosen}
              onChange={(key) => {
                setPlanKey(key)
                setVersion(undefined)
              }}
              choices={sorted.map((p) => ({
                value: p.key,
                label: `${p.name} v${p.latestVersion}`,
                note: [
                  p.key === org.plan?.key ? `Current: v${org.plan.version}` : null,
                  plural(
                    p.versions.reduce((sum, v) => sum + v.organizations, 0),
                    'organization',
                  ),
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
            {plan && plan.versions.length > 1 && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  aria-expanded={more}
                  onClick={() => setMore(!more)}
                  className="inline-flex min-h-8 items-center gap-1 self-start rounded-sm font-semibold text-link text-xs outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
                >
                  More options
                  <ChevronDownIcon
                    aria-hidden
                    className={more ? 'size-3.5 rotate-180' : 'size-3.5'}
                  />
                </button>
                {more && (
                  <Field>
                    <FieldLabel htmlFor={versionId}>Use an older version</FieldLabel>
                    <NativeSelect
                      id={versionId}
                      value={version ?? ''}
                      onChange={(event) =>
                        setVersion(event.target.value ? Number(event.target.value) : undefined)
                      }
                    >
                      <option value="">Latest (v{plan.latestVersion})</option>
                      {plan.versions
                        .filter((v) => v.version !== plan.latestVersion)
                        .map((v) => (
                          <option key={v.version} value={v.version}>
                            v{v.version} · {plural(v.organizations, 'organization')}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                )}
              </div>
            )}
          </>
        )
      }
    />
  )
}
