import { createFileRoute } from '@tanstack/react-router'
import { ConsoleNotFoundPage } from '@/features/console/shell/console-not-found'

/** Any other address under /console: the 404 inside the console shell. */
export const Route = createFileRoute('/console/$')({
  component: ConsoleNotFoundPage,
})
