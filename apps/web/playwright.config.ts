import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

// Locally, e2e starts its own API and web server on separate ports, so it never meets the
// rate limits of a running `pnpm dev` and never shares its sessions. CI uses the usual ports.
// E2E_API_PORT and E2E_WEB_PORT override both, e.g. to run CI mode next to `pnpm dev`.
const apiPort = Number(process.env.E2E_API_PORT) || (isCI ? 3000 : 3100)
const webPort = Number(process.env.E2E_WEB_PORT) || (isCI ? 5173 : 5174)
const webOrigin = `http://localhost:${webPort}`
const apiUrl = `http://localhost:${apiPort}`

// Specs sign in many times from one IP and must not call Have I Been Pwned. The dev mail
// transport writes the emails (EMAIL_DEV_DIR, default .mail/) that specs read codes from.
const apiEnv = {
  PORT: String(apiPort),
  WEB_ORIGIN: webOrigin,
  AUTH_RATE_LIMIT: 'off',
  PWNED_PASSWORDS_CHECK: 'off',
  EMAIL_TRANSPORT: 'dev',
}

export default defineConfig({
  testDir: './e2e',
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
      command: isCI ? 'pnpm --filter @vento/api start' : 'pnpm --filter @vento/api dev',
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
      env: { VITE_API_PROXY: apiUrl },
      timeout: 60_000,
    },
  ],
})
