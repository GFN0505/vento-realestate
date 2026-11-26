// Fails when the signed-in Home's first load is heavier than the budget (gzipped JS + CSS).
// Run after `vite build` (it reads dist/.vite/manifest.json).
//
// First load for Home = the entry plus the route chunks Home needs (`_app`, `_shell`, the index
// page) and everything those import statically. Lazy pieces (the ⌘K palette, menus, the More
// sheet, dialogs, other pages) download later and are not counted. Fonts are not counted.
// Sizes use 1 KB = 1000 bytes, the same as Vite's build output.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const out = (text) => process.stdout.write(`${text}\n`)
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB) || 200
const dist = join(import.meta.dirname, '..', 'dist')
const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'))

const HOME_ROUTES = [
  'src/routes/_app.tsx?tsr-split=component',
  'src/routes/_app/_shell.tsx?tsr-split=component',
  'src/routes/_app/_shell/index.tsx?tsr-split=component',
]
const roots = ['index.html', ...HOME_ROUTES]
for (const root of roots) {
  if (!manifest[root]) {
    process.stderr.write(
      `bundle-check: "${root}" is not in the manifest. Did a route move? Update HOME_ROUTES.\n`,
    )
    process.exit(2)
  }
}

/** Every chunk reachable through static imports, with its CSS. Dynamic imports are skipped. */
const files = new Map()
const seen = new Set()
function visit(key) {
  if (seen.has(key)) return
  seen.add(key)
  const chunk = manifest[key]
  if (!chunk) throw new Error(`bundle-check: manifest has no "${key}"`)
  files.set(chunk.file, key)
  for (const css of chunk.css ?? []) files.set(css, key)
  for (const next of chunk.imports ?? []) visit(next)
}
for (const root of roots) visit(root)

const rows = [...files.keys()].map((file) => {
  const bytes = gzipSync(readFileSync(join(dist, file))).length
  return { file, bytes }
})
rows.sort((a, b) => b.bytes - a.bytes)
const total = rows.reduce((sum, row) => sum + row.bytes, 0)
const kb = (bytes) => (bytes / 1000).toFixed(1)

out('Signed-in Home first load, gzipped:')
for (const row of rows) out(`  ${kb(row.bytes).padStart(7)} KB  ${row.file}`)
out(
  `  ${'-'.repeat(7)}\n  ${kb(total).padStart(7)} KB  total (${rows.length} files), budget ${BUDGET_KB} KB`,
)

if (total > BUDGET_KB * 1000) {
  process.stderr.write(`\nbundle-check: ${kb(total)} KB is over the ${BUDGET_KB} KB budget.\n`)
  process.exit(1)
}
