import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiUrl = process.env.VITE_API_PROXY ?? 'http://localhost:3000'

export default defineConfig({
  // The router plugin must run before React so route files are code-split.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
    strictPort: true,
    // Same origin in development: no CORS, and auth cookies just work.
    proxy: { '/rpc': apiUrl, '/health': apiUrl },
  },
})
