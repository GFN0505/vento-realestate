import { loadLocalEnvFile } from '@/lib/repo-root'

// Tests always run against the separate test database, never development data.
loadLocalEnvFile(import.meta.dirname)

const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env and run pnpm db:up.')
}
// Tests will truncate tables, so refuse anything that isn't clearly a test database.
if (!new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error(
    `TEST_DATABASE_URL must point at a database whose name ends in _test (got ${new URL(testUrl).pathname})`,
  )
}
process.env.DATABASE_URL = testUrl
// Keep test output readable; failures still show warnings and errors.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'warn'
