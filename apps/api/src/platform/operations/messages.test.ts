import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Operation messages are shown by the console as well as the commands, so they never name a
// command flag or tell someone to run a command; each channel adds its own next step.

/** Reachable only from the CLI (no console path), so they keep their wording (plan §6.1). */
const COMMAND_ONLY = ['Super-admins already exist. Use --by with one of them.']

function platformErrorMessages(): string[] {
  const dir = import.meta.dirname
  const messages: string[] = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    const source = readFileSync(join(dir, file), 'utf8')
    for (const match of source.matchAll(/PlatformError\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)) {
      messages.push(match[2] ?? '')
    }
  }
  return messages
}

describe('operation messages', () => {
  const messages = platformErrorMessages()

  it('finds them', () => {
    expect(messages.length).toBeGreaterThan(20)
  })

  it.each(messages.filter((m) => !COMMAND_ONLY.includes(m)))('"%s" names no command', (m) => {
    expect(m).not.toMatch(/--|\bRun /)
  })
})
