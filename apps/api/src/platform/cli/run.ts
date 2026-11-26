import { CommandError } from '../command-error'
import { type CommandDeps, parse } from './context'
import { flagsCommand } from './flags'
import { plansCommand } from './plans'
import { superadminCommand } from './superadmin'

const COMMANDS = { flags: flagsCommand, plans: plansCommand, superadmin: superadminCommand }
export type CommandGroup = keyof typeof COMMANDS

/** Runs one command. Returns the exit code: 0 done (or declined), 1 refused, 2 bad usage. */
export async function runCommand(
  group: string,
  args: string[],
  deps: CommandDeps,
): Promise<number> {
  const handler = COMMANDS[group as CommandGroup]
  if (!handler) {
    deps.io.error(`Unknown command group "${group}". Use flags, plans or superadmin.`)
    return 2
  }
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(args)
  } catch (error) {
    deps.io.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  try {
    await handler(deps, parsed)
    return 0
  } catch (error) {
    if (error instanceof CommandError) {
      deps.io.error(error.message)
      return 1
    }
    throw error
  }
}
