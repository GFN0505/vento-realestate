import { FEATURE_KEYS, type FeatureKey, featureLabel, isCoreFeature } from '@vento/shared'
import type { PlanDetail } from '@vento/shared/console'
import { StatusBadge } from '@/components/status-badge'
import { formatDate } from '@/lib/format'
import { DetailCard, FactRow } from '../ui/detail-card'
import { count, LIMIT_LABEL, moduleLabel, naira, plural, SHOWN_LIMITS } from '../words'

type Version = PlanDetail['versions'][number]

/** The catalog group a feature sits in: "sales.leads" → sales; a module is its own group. */
export function featureModule(key: FeatureKey): string {
  return key.split('.')[0] ?? key
}

/** A version's features by module, in catalog order. */
export function groupFeatures(keys: readonly FeatureKey[]): { module: string; labels: string[] }[] {
  const included = new Set(keys)
  const groups = new Map<string, string[]>()
  for (const key of FEATURE_KEYS) {
    if (!included.has(key)) continue
    const module = featureModule(key)
    groups.set(module, [...(groups.get(module) ?? []), featureLabel(key)])
  }
  return [...groups].map(([module, labels]) => ({ module, labels }))
}

const CORE_COUNT = FEATURE_KEYS.filter(isCoreFeature).length

/** One version: when, who is on it, features by module (core collapsed), and limits. */
export function PlanVersionCard({
  version,
  latest,
  planName,
  className,
}: {
  version: Version
  latest: boolean
  planName: string
  className?: string
}) {
  const limits = version.limits
  return (
    <DetailCard
      className={className}
      title={
        <span className="flex items-center gap-2">
          {planName} v{version.version}
          {latest && <StatusBadge tone="emerald">Latest</StatusBadge>}
        </span>
      }
    >
      <p className="pb-2 text-muted-foreground text-xs tabular-nums">
        Published {formatDate(version.publishedAt)} ·{' '}
        {plural(version.organizations, 'organization')}
      </p>
      <FactRow label="Core">Core: in every plan ({count(CORE_COUNT)})</FactRow>
      {groupFeatures(version.features).map((group) => (
        <div key={group.module} className="border-t py-2 text-[13px]">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
            {group.module === 'ai' ? 'AI' : moduleLabel(group.module)}
          </p>
          <p className="mt-0.5 leading-relaxed">{group.labels.join(', ')}</p>
        </div>
      ))}
      {SHOWN_LIMITS.map((key) => {
        const value = limits[key]
        return (
          <FactRow key={key} label={LIMIT_LABEL[key]}>
            {value === undefined ? 'Unlimited' : count(value)}
          </FactRow>
        )
      })}
      <FactRow label="AI budget base">{naira(limits.ai_budget)} a month</FactRow>
    </DetailCard>
  )
}
