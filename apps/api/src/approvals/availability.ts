import { APPROVAL_ACTION_KEYS, APPROVAL_ACTIONS, type ApprovalActionKey } from '@vento/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { OrganizationAvailability } from '@/platform/availability'

// An approvable action belongs to a feature (decision 0026): where the organization doesn't have
// it, its rules are hidden, and its requests can't be read or decided (security L2), as every
// procedure of that feature answers NOT_FOUND.

type Features = Pick<OrganizationAvailability, 'has'>

/** Whether the organization has the action's feature (platform actions: always). */
export function actionAvailable(features: Features, actionKey: ApprovalActionKey): boolean {
  const feature = APPROVAL_ACTIONS[actionKey].feature
  return feature === null || features.has(feature)
}

/** ` and r.action_key = any(…)` for queries on `approval_requests r`: only available actions. */
export function availableActionsSql(features: Features): SQL {
  const keys = APPROVAL_ACTION_KEYS.filter((k) => actionAvailable(features, k))
  if (keys.length === APPROVAL_ACTION_KEYS.length) return sql``
  if (keys.length === 0) return sql` and false`
  return sql` and r.action_key = any(${sql.raw(`array[${keys.map((k) => `'${k}'`).join(', ')}]::text[]`)})`
}
