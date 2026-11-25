import { execFileSync } from 'node:child_process'
import { Client } from 'pg'

/**
 * Playwright global setup (local runs): make sure the e2e database exists and is migrated.
 * e2e gets its own database so test accounts never land in development data.
 */
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const target = new URL(url)
const name = target.pathname.slice(1)
if (!name.endsWith('_e2e'))
  throw new Error(`Refusing to prepare ${name}: e2e databases end in _e2e`)

const admin = new URL(url)
admin.pathname = '/postgres'
const client = new Client({ connectionString: admin.toString() })
await client.connect()
const exists = await client.query('select 1 from pg_database where datname = $1', [name])
// The name is checked above, so it's safe to interpolate as an identifier.
if (exists.rowCount === 0) await client.query(`create database "${name}"`)
await client.end()

execFileSync('pnpm', ['exec', 'tsx', 'src/db/migrate.ts'], { stdio: 'inherit', env: process.env })
