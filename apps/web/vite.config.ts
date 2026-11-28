import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const apiUrl = process.env.VITE_API_PROXY ?? 'http://localhost:3000'

/*
 * Vite lists, beside every dynamic import, all the chunks the imported one needs, so the browser
 * can fetch them in parallel. It leaves in the chunks the importing chunk already loaded through
 * its own static imports (React, the router, the query client…), which can't be fetched again.
 * Dropping those changes nothing at run time and keeps a few KB of file lists out of the first
 * load. The plugin reads the static import graph just before Vite writes those lists.
 */
const loadedWith = new Map<string, Set<string>>()
function skipLoadedPreloads(): Plugin {
  return {
    name: 'vento:skip-loaded-preloads',
    apply: 'build',
    generateBundle(_, bundle) {
      loadedWith.clear()
      const closure = (file: string, seen: Set<string>) => {
        const chunk = bundle[file]
        if (seen.has(file) || chunk?.type !== 'chunk') return seen
        seen.add(file)
        for (const next of chunk.imports) closure(next, seen)
        return seen
      }
      for (const file of Object.keys(bundle)) loadedWith.set(file, closure(file, new Set()))
    },
  }
}

export default defineConfig({
  // The router plugin must run before React so route files are code-split.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    skipLoadedPreloads(),
  ],
  resolve: { tsconfigPaths: true },
  // The e2e dev server gets its own dependency cache, so it never re-optimises (and reloads)
  // under a developer's `pnpm dev` running at the same time.
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  build: {
    manifest: true,
    modulePreload: {
      resolveDependencies: (_, deps, { hostId }) => {
        const loaded = loadedWith.get(hostId)
        return loaded ? deps.filter((dep) => !loaded.has(dep)) : deps
      },
    },
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
