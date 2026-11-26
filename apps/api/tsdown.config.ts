import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts', 'src/platform/cli/main.ts'],
  platform: 'node',
  target: 'node24',
  format: 'esm',
  deps: {
    // Bundle the workspace package (and what it imports) so production doesn't need its TypeScript source.
    alwaysBundle: ['@vento/shared', '@vento/shared/console'],
    onlyBundle: false,
  },
})
