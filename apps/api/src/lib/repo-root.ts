import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Walks up from `start` to the monorepo root (the folder with pnpm-workspace.yaml). */
export function findRepoRoot(start: string): string | undefined {
  let dir = start
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Loads the repo-root .env for local runs. Variables already set are never overridden.
 * `start` can be undefined when a tool loads this file as CommonJS (drizzle-kit does),
 * where `import.meta.dirname` doesn't exist; the working directory is used instead.
 */
export function loadLocalEnvFile(start: string | undefined) {
  const root = findRepoRoot(start ?? process.cwd())
  const file = root && join(root, '.env')
  if (file && existsSync(file)) process.loadEnvFile(file)
}
