import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { APPROVAL_ACTION_KEYS } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { approvalPlugins } from './registry'

// Decision 0024: a guarded action is a catalog entry plus a plug-in, and every plug-in is proven
// through its real service. This walk fails when a key has no plug-in or no service test.

const modules = join(import.meta.dirname, '..', 'modules')

function approvalTests(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return approvalTests(path)
    return name.endsWith('.approvals.test.ts') ? [path] : []
  })
}

describe('approvals registry', () => {
  const plugins = approvalPlugins()

  it('has exactly the catalog’s keys, each plug-in under its own key', () => {
    expect(Object.keys(plugins).sort()).toEqual([...APPROVAL_ACTION_KEYS].sort())
    for (const [key, plugin] of Object.entries(plugins)) expect(plugin.key).toBe(key)
  })

  it.each(APPROVAL_ACTION_KEYS)('%s has a *.approvals.test.ts through its service', (key) => {
    const files = approvalTests(modules).filter((path) =>
      readFileSync(path, 'utf8').includes(`describe('${key}`),
    )
    expect(files, `no src/modules/**/*.approvals.test.ts describes ${key}`).not.toEqual([])
  })
})
