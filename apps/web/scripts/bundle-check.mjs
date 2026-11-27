// Fails when the signed-in Home's first load is heavier than the budget (gzipped JS + CSS), or
// when code that belongs to a later screen reaches it. `pnpm bundle:check` builds with hidden
// sourcemaps into node_modules/.bundle-check first; pass another build folder as the argument.
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
const dist = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(import.meta.dirname, '..', 'dist')
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

// Code that must never reach Home's first load (plan 3c §7, 3d §8.3, console §9.1): the shared role
// rules, the roles screens, the Company sheet, My security, the WebAuthn code (it loads only when
// someone starts a passkey action), and anything of the Vento console: customers never download it. A static import from the shell or Home would pull them in. Read from
// each first-load chunk's sourcemap, so a rename or minification can't hide it.
const FORBIDDEN = [
  'access/role-rules.ts',
  'features/roles/',
  'features/companies/sheet/',
  'features/security/',
  'lib/passkey-client.ts',
  '@simplewebauthn/browser',
  '@better-auth/passkey',
  'features/console/',
  'packages/shared/src/console/',
  '@simplewebauthn/server',
]
const leaks = []
for (const row of rows) {
  if (!row.file.endsWith('.js')) continue
  let map
  try {
    map = JSON.parse(readFileSync(join(dist, `${row.file}.map`), 'utf8'))
  } catch {
    // The bundler's tiny runtime helper has no sources of ours, and no map.
    if (row.file.includes('rolldown-runtime')) continue
    process.stderr.write(
      `bundle-check: no sourcemap for ${row.file}. Build with --sourcemap (pnpm bundle:check does).\n`,
    )
    process.exit(2)
  }
  for (const source of map.sources ?? []) {
    const hit = FORBIDDEN.find((part) => source.includes(part))
    if (hit) leaks.push(`${row.file}: ${source.slice(source.indexOf(hit))}`)
  }
}
if (leaks.length > 0) {
  process.stderr.write(
    `\nbundle-check: later-screen code reached Home's first load:\n  ${leaks.join('\n  ')}\n`,
  )
  process.exit(1)
}
