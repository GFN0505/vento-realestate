import type { ConsoleContract } from '@vento/shared/console'

/** Every console procedure path, e.g. `releases.setStage.apply` (from the contract's type). */
type PathsOf<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends { '~orpc': unknown }
    ? `${P}${K}`
    : PathsOf<T[K], `${P}${K}.`>
}[keyof T & string]
export type ConsolePath = PathsOf<ConsoleContract>
/** Only changes: the `apply` half of each preview/apply pair. */
export type ConsoleApplyPath = Extract<ConsolePath, `${string}.apply`>

/**
 * Every command that changes platform data, and the console procedure that makes the same
 * change (admin-console plan §7.2). `authorise` takes one of these ids, so a new change command
 * can't refuse without --break-glass unless it's listed here, and an entry can't name a console
 * path that doesn't exist. The parity test runs both channels for each and compares the trails.
 */
export const CHANGE_COMMANDS = {
  'flags stage': { console: 'releases.setStage.apply' },
  'flags group': { console: 'organizations.changeReleaseGroup.apply' },
  'flags override': { console: 'organizations.setOverride.apply' },
  'flags override clear': { console: 'organizations.clearOverride.apply' },
  'plans publish': { console: 'plans.publish.apply' },
  'plans assign': { console: 'organizations.changePlan.apply' },
  'plans trial': { console: 'organizations.startTrial.apply' },
  'plans trial --end': { console: 'organizations.endTrial.apply' },
  'plans addon': { console: 'organizations.addAi.apply' },
  'plans addon --remove': { console: 'organizations.removeAi.apply' },
  'plans override feature': { console: 'organizations.setOverride.apply' },
  'plans override limit': { console: 'organizations.setOverride.apply' },
  'plans override clear': { console: 'organizations.clearOverride.apply' },
  'plans bootstrap': { console: 'plans.publish.apply' },
  'superadmin grant': { console: 'superAdmins.add.apply' },
  'superadmin revoke': { console: 'superAdmins.remove.apply' },
} as const satisfies Record<string, { console: ConsoleApplyPath }>

export type ChangeCommandId = keyof typeof CHANGE_COMMANDS
