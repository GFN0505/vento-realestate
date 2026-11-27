import { PlatformError } from '../platform-error'
import { approvalsCommand } from './approvals'
import { announceBreakGlass } from './break-glass'
import { type BreakGlassChange, type CommandDeps, parse } from './context'
import { flagsCommand } from './flags'
import { plansCommand } from './plans'
import { superadminCommand } from './superadmin'

const COMMANDS = {
  flags: flagsCommand,
  plans: plansCommand,
  superadmin: superadminCommand,
  approvals: approvalsCommand,
}
export type CommandGroup = keyof typeof COMMANDS

/** Runs one command. Returns the exit code: 0 done (or declined), 1 refused, 2 bad usage. */
export async function runCommand(
  group: string,
  args: string[],
  deps: CommandDeps,
): Promise<number> {
  const handler = COMMANDS[group as CommandGroup]
  if (!handler) {
    deps.io.error(`Unknown command group "${group}". Use flags, plans, superadmin or approvals.`)
    return 2
  }
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(args)
  } catch (error) {
    deps.io.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  const breakGlass: BreakGlassChange[] = []
  try {
    await handler({ ...deps, breakGlass }, parsed)
    return 0
  } catch (error) {
    if (error instanceof PlatformError) {
      const step = nextStep(error)
      deps.io.error(step ? `${error.message} ${step}` : error.message)
      return 1
    }
    throw error
  } finally {
    // Whatever the outcome, any change that did commit is announced (a refused one wrote nothing).
    await announceBreakGlass(deps, breakGlass)
  }
}

/** The command's own next step after a refusal; operation messages never name a flag. */
function nextStep(error: PlatformError): string | null {
  const { next, organizationName, missing } = error.extra
  if (next === 'end_trial') {
    return `End it first with plans trial "${organizationName ?? '…'}" --end.`
  }
  if (next === 'change_ai_budget') return 'Remove it first with --remove.'
  if (next === 'resend_invitation') return 'Resend it from Super-admins in the console.'
  if (missing === 'plan') return 'Run plans list to see them.'
  return null
}
