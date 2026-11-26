import type { FeatureKey } from '@vento/shared'
import { featuresOf, useMe } from '@/features/preview/use-effective-permissions'

/**
 * The organization's available features, for screens that list things by feature (settings
 * sections, the permissions matrix, approval rules, Home cards): filter by this so an
 * unavailable feature appears nowhere. Navigation itself reads `NavAccess`.
 */
export function useAvailableFeatures() {
  return featuresOf(useMe())
}

/** Whether one feature is available, e.g. `useFeature('platform.whatsapp')`. */
export function useFeature(key: FeatureKey): boolean {
  return useAvailableFeatures().has(key)
}
