import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup-env.ts'],
    globalSetup: ['./src/test/global-setup.ts'],
  },
})
