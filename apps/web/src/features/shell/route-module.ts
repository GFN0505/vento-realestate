import type { PermissionModule } from '@vento/shared'

type MatchLike = { staticData?: { module?: PermissionModule } }

/**
 * The module of the page on screen: the deepest matched route that declares one. A module's
 * child routes (e.g. /sales/units/$id in later bricks) inherit their parent's module.
 */
export function routeModule(matches: readonly MatchLike[]): PermissionModule | undefined {
  return matches.findLast((match) => match.staticData?.module)?.staticData?.module
}
