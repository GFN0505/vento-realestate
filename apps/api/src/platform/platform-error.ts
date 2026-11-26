/** The console's next step after a refusal (an **End trial** link, **Change budget**). */
export type PlatformNext = 'end_trial' | 'change_ai_budget'

/**
 * A refusal from a platform operation, shown as is by both channels. Messages never name a
 * command flag (a test checks): each channel adds its own next step from `extra`.
 * - `refused`: the operation won't do it (CONFLICT `platform_refused` in the console)
 * - `stale`: the state moved since the preview (CONFLICT `platform_stale`)
 * - `not_found`: the organization, plan or person doesn't exist (NOT_FOUND)
 */
export class PlatformError extends Error {
  override name = 'PlatformError'
  constructor(
    message: string,
    readonly kind: 'refused' | 'stale' | 'not_found' = 'refused',
    readonly extra: {
      next?: PlatformNext
      changedByName?: string
      /** The organization the refusal is about, for the command's own next step. */
      organizationName?: string
      /** What wasn't found, for the command's own next step ("Run plans list…"). */
      missing?: 'plan'
    } = {},
  ) {
    super(message)
  }
}
