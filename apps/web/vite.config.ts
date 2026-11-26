import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiUrl = process.env.VITE_API_PROXY ?? 'http://localhost:3000'

export default defineConfig({
  // The router plugin must run before React so route files are code-split.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  // The e2e dev server gets its own dependency cache, so it never re-optimises (and reloads)
  // under a developer's `pnpm dev` running at the same time.
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  build: {
    manifest: true,
    rollupOptions: {
      treeshake: {
        // @vento/shared only declares schemas and constants. Saying so lets a screen that needs
        // one error code skip zod and decimal.js (about 70 KB gzipped) from the shared barrel.
        moduleSideEffects: (id) => !/[\\/]packages[\\/]shared[\\/]/.test(id),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same origin in development: no CORS, and auth cookies just work.
    proxy: { '/rpc': apiUrl, '/api': apiUrl, '/health': apiUrl },
  },
})
