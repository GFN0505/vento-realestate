import { readdir, rm, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { findRepoRoot } from '@/lib/repo-root'

/** `EMAIL_DEV_DIR` as an absolute path; relative values are from the repo root. */
export function mailboxFolder(dir: string): string {
  const root = findRepoRoot(import.meta.dirname) ?? process.cwd()
  return isAbsolute(dir) ? dir : join(root, dir)
}

export type PruneOptions = { maxAgeDays: number; keepNewest: number; now?: Date }

export const MAILBOX_RETENTION: PruneOptions = { maxAgeDays: 7, keepNewest: 500 }

/**
 * Keeps the development mailbox small: removes saved emails older than `maxAgeDays`, then all
 * but the newest `keepNewest`. Only the `.json` files the dev transport writes are touched.
 * Never run while e2e specs are reading codes from the folder. Returns how many were removed.
 */
export async function pruneMailbox(dir: string, options: PruneOptions): Promise<number> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.json'))
  const files = await Promise.all(
    names.map(async (name) => {
      const info = await stat(join(dir, name)).catch(() => null)
      return info?.isFile() ? { name, modified: info.mtimeMs } : null
    }),
  )
  const cutoff = (options.now ?? new Date()).getTime() - options.maxAgeDays * 24 * 3600_000
  const newestFirst = files
    .filter((f): f is { name: string; modified: number } => f !== null)
    .sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name))
  const doomed = newestFirst.filter((f, i) => f.modified < cutoff || i >= options.keepNewest)
  await Promise.all(doomed.map((f) => rm(join(dir, f.name), { force: true })))
  return doomed.length
}
