import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Site and sales users work on mid-range Android phones.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Locally: dev servers (reused if already running). In CI: the production builds from
  // `pnpm build`, so the bundled API and static web app are what gets tested.
  webServer: [
    {
      command: isCI ? 'pnpm --filter @vento/api start' : 'pnpm --filter @vento/api dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      // `vite preview` reuses the dev proxy settings, so /rpc still reaches the API.
      command: isCI
        ? 'pnpm --filter @vento/web preview --port 5173 --strictPort'
        : 'pnpm --filter @vento/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
})
