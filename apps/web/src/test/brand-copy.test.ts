import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { findBareVento, stripComments } from '@vento/shared'
import { describe, expect, it } from 'vitest'

// The product is always "Vento Real Estate" (decision 0022). Every word the web shows comes from
// these files, so a bare "Vento" in them (comments aside) fails here, with file and line.

const repo = resolve(import.meta.dirname, '../../../..')
const src = resolve(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const copy = /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'routeTree.gen.ts'
    return copy ? [path] : []
  })
}

function bare(path: string, text: string): string[] {
  const file = relative(repo, path)
  return findBareVento(text, file).map((hit) => `${file}:${hit.line}: ${hit.text}`)
}

describe('web copy says Vento Real Estate', () => {
  it('has no bare "Vento" in any source file', () => {
    const files = sourceFiles(src).filter((f) => !f.includes(`${join('src', 'test')}/`))
    expect(files.length).toBeGreaterThan(100)
    const found = files.flatMap((f) => bare(f, stripComments(readFileSync(f, 'utf8'))))
    expect(found).toEqual([])
  })

  it('has no bare "Vento" in index.html', () => {
    const path = resolve(src, '../index.html')
    expect(bare(path, readFileSync(path, 'utf8'))).toEqual([])
  })
})
