import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Tailwind v4: `outline-hidden` sets `--tw-outline-style: none`, and `outline-2` reads that
 * variable, so `focus-visible:outline-2` alone computes to no outline at all. Every focus ring
 * must also say `focus-visible:outline-solid`. (A browser check of the computed style is in
 * e2e/support/focus-ring.ts.)
 */

const SRC = join(import.meta.dirname, '..', '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('focus rings', () => {
  it('pair every focus-visible outline width with a solid outline style', () => {
    const missing = files(SRC).filter((path) => {
      const text = readFileSync(path, 'utf8')
      const widths = text.match(/focus-visible:outline-2/g)?.length ?? 0
      const solids = text.match(/focus-visible:outline-solid/g)?.length ?? 0
      return widths > solids
    })
    expect(missing.map((p) => p.slice(SRC.length + 1))).toEqual([])
  })
})
