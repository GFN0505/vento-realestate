import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { logger } from '@/lib/logger'
import { db, pool } from './client'

// Runs as its own release step before new code goes live, never on app start.
// apps/api/drizzle, from both src/db/migrate.ts and the bundled dist/db/migrate.mjs,
// so it works whatever folder the release step runs from.
const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')

async function main() {
  // A missing journal means a broken deploy, not "nothing to do": fail loudly.
  if (!existsSync(resolve(migrationsFolder, 'meta/_journal.json'))) {
    throw new Error(`Migrations not found at ${migrationsFolder}`)
  }
  await migrate(db, { migrationsFolder })
  logger.info('Migrations applied')
}

try {
  await main()
} catch (error) {
  logger.error('Migration failed', { error: String(error) })
  process.exitCode = 1
} finally {
  await pool.end()
}
