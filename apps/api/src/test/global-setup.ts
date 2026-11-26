import { execFileSync } from 'node:child_process'
import { Client } from 'pg'
import { loadLocalEnvFile } from '../lib/repo-root'

/**
 * Recreates the test database schema, then migrates it, once per run. Audit events are
 * append-only (even TRUNCATE is refused), so a clean slate means dropping the schema.
 */
export default async function setup() {
  loadLocalEnvFile(import.meta.dirname)
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is not set')
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must name a database ending in _test')
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE')
    await client.query('DROP SCHEMA IF EXISTS public CASCADE')
    await client.query('CREATE SCHEMA public')
  } finally {
    await client.end()
  }

  execFileSync('pnpm', ['exec', 'tsx', 'src/db/migrate.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
  // The starting plans, committed once: test files run in parallel, and each publishing them in
  // its own transaction would collide on the plan keys.
  execFileSync('pnpm', ['exec', 'tsx', 'src/platform/cli/main.ts', 'plans', 'bootstrap'], {
    env: { ...process.env, DATABASE_URL: url, LOG_LEVEL: 'error' },
    stdio: 'ignore',
  })
}
