import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

// Locally, e2e uses its own database so test accounts never land in development data.
// The servers, fixtures and global setup all inherit this. CI sets DATABASE_URL itself.
if (!isCI) {
  process.env.DATABASE_URL =
    process.env.E2E_DATABASE_URL ?? 'postgres://vento:vento@localhost:5432/vento_e2e'
}

// Locally, e2e starts its own API and web server on separate ports, so it never meets the
// rate limits of a running `pnpm dev` and never shares its sessions. CI uses the usual ports.
// E2E_API_PORT and E2E_WEB_PORT override both, e.g. to run CI mode next to `pnpm dev`.
const apiPort = Number(process.env.E2E_API_PORT) || (isCI ? 3000 : 3193)
const webPort = Number(process.env.E2E_WEB_PORT) || (isCI ? 5173 : 5193)
const webOrigin = `http://localhost:${webPort}`
const apiUrl = `http://localhost:${apiPort}`

// Specs sign in many times from one IP, so per-IP limits are off. The dev mail
// transport writes the emails (EMAIL_DEV_DIR, default .mail/) that specs read codes from.
const apiEnv = {
  PORT: String(apiPort),
  WEB_ORIGIN: webOrigin,
  AUTH_RATE_LIMIT: 'off',
  EMAIL_TRANSPORT: 'dev',
  // Availability is read from a snapshot the API reloads on a timer; the default is 10 seconds.
  // One second (the lowest allowed) keeps override specs quick without changing the code path.
  FEATURE_SNAPSHOT_REFRESH_SECONDS: '1',
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webOrigin,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Site and sales users work on mid-range Android phones.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Locally: dev servers on the e2e ports. In CI: the production builds from `pnpm build`, so
  // the bundled API and static web app are what gets tested.
  webServer: [
    {
      // Locally without watch mode, so edits elsewhere don't restart the API mid-run.
      command: isCI
        ? 'pnpm --filter @vento/api start'
        : // Create and migrate the e2e database first (servers start before any setup hook).
          'pnpm --filter @vento/api exec tsx src/test/e2e-db.ts && pnpm --filter @vento/api exec tsx src/index.ts',
      url: `${apiUrl}/health`,
      reuseExistingServer: !isCI,
      env: apiEnv,
      timeout: 60_000,
    },
    {
      // `vite preview` reuses the dev proxy settings, so /rpc still reaches the API.
      command: isCI
        ? `pnpm --filter @vento/web preview --port ${webPort} --strictPort`
        : `pnpm --filter @vento/web dev --port ${webPort} --strictPort`,
      url: webOrigin,
      reuseExistingServer: !isCI,
      env: { VITE_API_PROXY: apiUrl, VITE_CACHE_DIR: 'node_modules/.vite-e2e' },
      timeout: 60_000,
    },
  ],
})
