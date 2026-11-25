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

/** Loads the repo-root .env for local runs. Variables already set are never overridden. */
export function loadLocalEnvFile(start: string) {
  const root = findRepoRoot(start)
  const file = root && join(root, '.env')
  if (file && existsSync(file)) process.loadEnvFile(file)
}
