import type { FeatureKey, PermissionSet } from '@vento/shared'
import { NAV, type NavAccess } from '@/features/shell/nav'

/** Every flag navigation uses. */
export const NAV_FLAGS: readonly FeatureKey[] = NAV.flatMap((item) =>
  item.flag ? [item.flag] : [],
)

type Options = {
  /** Default: every nav flag, without early access. */
  features?: readonly FeatureKey[]
  earlyAccess?: readonly FeatureKey[]
  /** Default: true, so unbuilt modules show as in 3a. */
  internal?: boolean
}

/** A `NavAccess` for tests: by default an internal organization with every module available. */
export function navAccess(permissions: PermissionSet | null, options: Options = {}): NavAccess {
  const keys = options.features ?? NAV_FLAGS
  const early = new Set(options.earlyAccess ?? [])
  return {
    permissions,
    features: new Map(keys.map((key) => [key, { earlyAccess: early.has(key) }])),
    internal: options.internal ?? true,
  }
}
