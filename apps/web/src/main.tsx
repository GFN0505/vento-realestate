import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from '@/lib/query-client'
import { createAppRouter } from '@/router'
// Self-hosted fonts. Inter's variable file serves every weight; the browser fetches only the
// subsets the page uses. Poppins is for headings: Latin, 500 and 600 only.
import '@fontsource-variable/inter/wght.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import './styles.css'

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
