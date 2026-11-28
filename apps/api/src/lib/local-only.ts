// Seeds and e2e fixtures write fictional people and parcels. They must never reach a real
// organization's database, whatever the shell they're run from has set.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Service names a CI job's database goes by (GitHub Actions service containers). */
const CI_HOSTS = new Set(['postgres', 'db'])

export const NOT_LOCAL_MESSAGE =
  'This writes test data, so it runs only against a local or CI database, never in production.'

/** Whether `databaseUrl` is a database on this machine, or a CI service when CI is set. */
export function isLocalDatabase(databaseUrl: string, ci: string | undefined): boolean {
  let host: string
  try {
    host = new URL(databaseUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return LOCAL_HOSTS.has(host) || (ci === 'true' && CI_HOSTS.has(host))
}

/** Refuses in production, or when the database isn't local (or CI's). */
export function assertLocalOnly(env: {
  NODE_ENV: string
  DATABASE_URL: string
  CI?: string | undefined
}): void {
  if (env.NODE_ENV === 'production' || !isLocalDatabase(env.DATABASE_URL, env.CI)) {
    throw new Error(NOT_LOCAL_MESSAGE)
  }
}
