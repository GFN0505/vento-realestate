import { execFileSync } from 'node:child_process'
import { loadLocalEnvFile } from '../lib/repo-root'

/** Brings the test database up to the latest migration once per run. */
export default function setup() {
  loadLocalEnvFile(import.meta.dirname)
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is not set')
  execFileSync('pnpm', ['exec', 'tsx', 'src/db/migrate.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
