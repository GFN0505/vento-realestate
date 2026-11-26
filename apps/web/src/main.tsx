import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { takeOverChunkReloads } from '@/lib/chunk-errors'
import { createQueryClient } from '@/lib/query-client'
import { createAppRouter } from '@/router'
// Self-hosted variable fonts (font-display: swap). Each file serves every weight, and the
// browser fetches only the unicode subsets a page uses. Inter for text, Geist for headings.
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/geist/wght.css'
import './styles.css'

// Offline, a page whose code can't download shows our Offline page, never the browser's.
takeOverChunkReloads()

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
