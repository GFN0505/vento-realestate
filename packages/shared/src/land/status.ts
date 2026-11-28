import type { ParcelStatus, TitleStageStatus } from './catalog'

/**
 * A parcel's status after a stage write, a stage-set change or an edit (plan §3):
 * - `acquired` with at least one stage, every one granted → `titled`;
 * - `titled` once a stage leaves granted, or a not-started stage is added → `acquired`;
 * - `prospect` and `under_acquisition` never become titled on their own;
 * - `in_development` and `sold_out` belong to Projects and Sales and are never touched.
 */
export function resolveParcelStatus(
  status: ParcelStatus,
  stages: readonly { status: TitleStageStatus }[],
): ParcelStatus {
  const allGranted = stages.length > 0 && stages.every((s) => s.status === 'granted')
  if (status === 'acquired' && allGranted) return 'titled'
  if (status === 'titled' && !allGranted) return 'acquired'
  return status
}
