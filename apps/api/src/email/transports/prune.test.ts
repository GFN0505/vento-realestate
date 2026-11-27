import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pruneMailbox } from './prune'

const now = new Date('2026-11-26T12:00:00Z')
const DAY = 24 * 3600_000
let dir: string

async function mail(name: string, ageDays: number): Promise<void> {
  const file = join(dir, name)
  await writeFile(file, '{}')
  const when = new Date(now.getTime() - ageDays * DAY)
  await utimes(file, when, when)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vento-mail-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('pruning the dev mailbox', () => {
  it('removes emails older than 7 days and keeps the rest', async () => {
    await mail('old.json', 8)
    await mail('recent.json', 6)
    await writeFile(join(dir, 'notes.txt'), 'not an email')

    const removed = await pruneMailbox(dir, { maxAgeDays: 7, keepNewest: 500, now })

    expect(removed).toBe(1)
    expect((await readdir(dir)).sort()).toEqual(['notes.txt', 'recent.json'])
  })

  it('keeps only the newest when there are too many', async () => {
    await mail('a.json', 3)
    await mail('b.json', 2)
    await mail('c.json', 1)

    await pruneMailbox(dir, { maxAgeDays: 7, keepNewest: 2, now })

    expect((await readdir(dir)).sort()).toEqual(['b.json', 'c.json'])
  })

  it('does nothing when the folder does not exist yet', async () => {
    const missing = join(dir, 'missing')
    await expect(pruneMailbox(missing, { maxAgeDays: 7, keepNewest: 500, now })).resolves.toBe(0)
  })
})
